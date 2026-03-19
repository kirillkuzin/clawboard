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
  /** Maximum reconnection attempts before giving up (default: Infinity) */
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

/**
 * React hook for consuming the SSE relay endpoint.
 * Manages EventSource lifecycle, reconnection, and event dispatching.
 */
export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const {
    apiUrl,
    apiKey,
    enabled = true,
    endpoint,
    onEvent,
    onStatusChange,
    maxRetries = Infinity,
  } = options;

  const [status, setStatus] = useState<SSEStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const manualDisconnectRef = useRef(false);
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

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    updateStatus("disconnected");
    setRetryCount(0);
    retryCountRef.current = 0;
  }, [updateStatus]);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (!apiUrl) {
      setError("API URL is required");
      updateStatus("error");
      return;
    }

    manualDisconnectRef.current = false;
    setError(null);
    updateStatus("connecting");

    // Build the SSE URL with query params (EventSource doesn't support custom headers)
    const params = new URLSearchParams();
    params.set("apiUrl", apiUrl);
    if (apiKey) params.set("apiKey", apiKey);
    if (endpoint) params.set("endpoint", endpoint);

    const sseUrl = `/api/sse?${params.toString()}`;

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    // Handle connection established
    es.addEventListener("connected", (e: MessageEvent) => {
      retryCountRef.current = 0;
      setRetryCount(0);
      setError(null);
      updateStatus("connected");

      try {
        const data = JSON.parse(e.data);
        const event: SSEEvent = {
          type: "connected",
          data,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        // Ignore parse errors for connection event
      }
    });

    // Handle disconnected event from relay
    es.addEventListener("disconnected", (e: MessageEvent) => {
      updateStatus("disconnected");
      try {
        const data = JSON.parse(e.data);
        setError(`Disconnected: ${data.reason || "unknown"}`);
      } catch {
        setError("Disconnected from server");
      }
    });

    // Handle error events from the relay
    es.addEventListener("error", (e: Event) => {
      // Check if it's a MessageEvent (relay error) or a plain Event (connection error)
      if (e instanceof MessageEvent) {
        try {
          const data = JSON.parse(e.data);
          setError(data.message || "Unknown error");
          const event: SSEEvent = {
            type: "error",
            data,
            timestamp: data.timestamp || new Date().toISOString(),
          };
          setLastEvent(event);
          onEventRef.current?.(event);
        } catch {
          setError("Stream error");
        }
      }

      // EventSource built-in error handling
      if (es.readyState === EventSource.CLOSED) {
        updateStatus("error");

        if (!manualDisconnectRef.current && retryCountRef.current < maxRetries) {
          retryCountRef.current += 1;
          setRetryCount(retryCountRef.current);
          // EventSource will auto-reconnect, but we track the attempt
        }
      }
    });

    // Handle generic message events (data without a named event)
    es.addEventListener("message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const event: SSEEvent = {
          type: data.type || "message",
          data,
          timestamp: data.timestamp || new Date().toISOString(),
        };
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        const event: SSEEvent = {
          type: "message",
          data: e.data,
          timestamp: new Date().toISOString(),
        };
        setLastEvent(event);
        onEventRef.current?.(event);
      }
    });

    // Listen for common OpenClaw event types
    const openclawEvents = [
      "agent_status",
      "agent_update",
      "conversation_update",
      "skill_execution",
      "task_update",
      "system_status",
      "heartbeat",
    ];

    for (const eventType of openclawEvents) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          const event: SSEEvent = {
            type: eventType,
            data,
            timestamp: data.timestamp || new Date().toISOString(),
          };
          setLastEvent(event);
          onEventRef.current?.(event);
        } catch {
          // Skip unparseable events
        }
      });
    }
  }, [apiUrl, apiKey, endpoint, maxRetries, updateStatus]);

  // Auto-connect when enabled and apiUrl changes
  useEffect(() => {
    if (enabled && apiUrl) {
      connect();
    }

    return () => {
      if (eventSourceRef.current) {
        manualDisconnectRef.current = true;
        eventSourceRef.current.close();
        eventSourceRef.current = null;
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
