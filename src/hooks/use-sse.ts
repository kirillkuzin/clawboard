"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type SSEStatus = "connecting" | "connected" | "disconnected" | "error";

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

export interface UseSSEOptions {
  /** API URL for the OpenClaw instance */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Whether to auto-connect on mount (default: true if apiUrl is set) */
  enabled?: boolean;
  /** Optional specific SSE endpoint on the backend */
  endpoint?: string;
  /** Callback for each received event */
  onEvent?: (event: SSEEvent) => void;
  /** Callback on connection status change */
  onStatusChange?: (status: SSEStatus) => void;
  /** Maximum reconnection attempts before giving up (default: 20) */
  maxRetries?: number;
}

export interface UseSSEReturn {
  /** Current connection status */
  status: SSEStatus;
  /** Last error message, if any */
  error: string | null;
  /** Most recent event received */
  lastEvent: SSEEvent | null;
  /** Connect to the SSE stream */
  connect: () => void;
  /** Disconnect from the SSE stream */
  disconnect: () => void;
  /** Number of reconnection attempts */
  retryCount: number;
}

/** Default reconnect delay in ms */
const RECONNECT_DELAY_MS = 5_000;

/**
 * React hook for consuming the SSE relay endpoint.
 * Uses fetch-based SSE to support sending credentials via headers
 * instead of query parameters.
 */
export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const {
    apiUrl,
    apiKey,
    enabled = true,
    endpoint,
    onEvent,
    onStatusChange,
    maxRetries = 20,
  } = options;

  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const manualDisconnectRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep callback refs fresh
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((newStatus: SSEStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  const dispatchEvent = useCallback((event: SSEEvent) => {
    setLastEvent(event);
    onEventRef.current?.(event);
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    updateStatus("disconnected");
    setRetryCount(0);
    retryCountRef.current = 0;
  }, [updateStatus]);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (!apiUrl) {
      setError("API URL is required");
      updateStatus("error");
      return;
    }

    manualDisconnectRef.current = false;
    setError(null);
    updateStatus("connecting");

    // Build the SSE URL - only non-sensitive params
    const params = new URLSearchParams();
    if (endpoint) params.set("endpoint", endpoint);
    const sseUrl = `/api/sse${params.toString() ? `?${params.toString()}` : ""}`;

    const controller = new AbortController();
    abortRef.current = controller;

    // Use fetch with headers for auth (not query params)
    fetch(sseUrl, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        "X-OpenClaw-URL": apiUrl,
        "X-OpenClaw-Key": apiKey || "",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed: HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            if (!manualDisconnectRef.current) {
              scheduleReconnect();
            }
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events (delimited by double newline)
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed) continue;

            // Parse SSE fields
            let eventType = "message";
            let data = "";

            for (const line of trimmed.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                data = line.slice(6);
              } else if (line.startsWith(":")) {
                // Comment (keep-alive), skip
                continue;
              }
            }

            if (!data) continue;

            // Handle special event types
            if (eventType === "connected") {
              retryCountRef.current = 0;
              setRetryCount(0);
              setError(null);
              updateStatus("connected");
            } else if (eventType === "disconnected") {
              updateStatus("disconnected");
            } else if (eventType === "error") {
              try {
                const parsed = JSON.parse(data);
                setError(parsed.message || "Unknown error");
              } catch {
                setError("Stream error");
              }
            }

            try {
              const parsed = JSON.parse(data);
              dispatchEvent({
                type: eventType,
                data: parsed,
                timestamp: parsed.timestamp || new Date().toISOString(),
              });
            } catch {
              dispatchEvent({
                type: eventType,
                data,
                timestamp: new Date().toISOString(),
              });
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;

        const msg = err instanceof Error ? err.message : "SSE connection error";
        setError(msg);
        updateStatus("error");

        if (!manualDisconnectRef.current) {
          scheduleReconnect();
        }
      });

    function scheduleReconnect() {
      if (manualDisconnectRef.current) return;
      if (retryCountRef.current >= maxRetries) {
        setError("Max reconnection attempts reached");
        updateStatus("error");
        return;
      }

      retryCountRef.current += 1;
      setRetryCount(retryCountRef.current);
      updateStatus("disconnected");

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!manualDisconnectRef.current) {
          connect();
        }
      }, RECONNECT_DELAY_MS);
    }
  }, [apiUrl, apiKey, endpoint, maxRetries, updateStatus, dispatchEvent]);

  // Auto-connect when enabled
  useEffect(() => {
    if (enabled && apiUrl) {
      connect();
    }

    return () => {
      manualDisconnectRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [enabled, apiUrl, apiKey, connect]);

  return {
    status,
    error,
    lastEvent,
    connect,
    disconnect,
    retryCount,
  };
}
