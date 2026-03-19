/**
 * Real-time Transport Layer for OpenClaw Dashboard
 *
 * Provides a unified event interface with automatic fallback:
 *   1. Try WebSocket connection (lowest latency, bidirectional)
 *   2. Fall back to SSE if WebSocket unavailable
 *   3. Fall back to REST polling as last resort
 *
 * All transports emit the same TransportEvent interface so the
 * ConnectionManager doesn't need to know which transport is active.
 */

import { getConnectionConfig } from "./api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportType = "websocket" | "sse" | "polling";

export type TransportStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/** Event emitted by any transport */
export interface TransportEvent {
  type: string;
  data: Record<string, unknown>;
  receivedAt: number;
  transport: TransportType;
}

/** Callback for transport events */
export type TransportEventHandler = (event: TransportEvent) => void;

/** Callback for transport status changes */
export type TransportStatusHandler = (
  status: TransportStatus,
  details: { transport: TransportType; error?: string }
) => void;

// ---------------------------------------------------------------------------
// Transport Interface
// ---------------------------------------------------------------------------

export interface ITransport {
  readonly type: TransportType;
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
}

// ---------------------------------------------------------------------------
// WebSocket Transport
// ---------------------------------------------------------------------------

export class WebSocketTransport implements ITransport {
  readonly type: TransportType = "websocket";
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private apiUrl: string,
    private apiKey: string,
    private onEvent: TransportEventHandler,
    private onStatus: TransportStatusHandler
  ) {}

  connect(): void {
    this.disconnect();

    try {
      const wsUrl = this.apiUrl
        .replace(/^http:/, "ws:")
        .replace(/^https:/, "wss:");
      const fullUrl = `${wsUrl}/api/v1/ws/events?api_key=${encodeURIComponent(this.apiKey)}`;

      this.onStatus("connecting", { transport: "websocket" });
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        this.onStatus("connected", { transport: "websocket" });
        this.startHeartbeat();
        this.emitEvent("connection.established", {
          transport: "websocket",
          timestamp: new Date().toISOString(),
        });
      };

      this.ws.onmessage = (msg) => {
        try {
          const parsed = JSON.parse(msg.data);
          const eventType = parsed.type || parsed.event || "message";
          const eventData =
            typeof parsed.data === "object" && parsed.data !== null
              ? parsed.data
              : parsed;
          this.emitEvent(eventType, eventData);
        } catch {
          // Non-JSON (ping/pong etc.)
          if (msg.data !== "ping" && msg.data !== "pong") {
            this.emitEvent("system.raw", { raw: msg.data });
          }
        }
      };

      this.ws.onerror = () => {
        this.onStatus("error", {
          transport: "websocket",
          error: "WebSocket connection error",
        });
      };

      this.ws.onclose = (ev) => {
        this.stopHeartbeat();
        if (ev.code !== 1000) {
          this.onStatus("error", {
            transport: "websocket",
            error: `WebSocket closed: code=${ev.code} reason=${ev.reason || "unknown"}`,
          });
        } else {
          this.onStatus("disconnected", { transport: "websocket" });
        }
        this.ws = null;
      };
    } catch (err) {
      this.onStatus("error", {
        transport: "websocket",
        error: err instanceof Error ? err.message : "WebSocket creation failed",
      });
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close(1000, "Client disconnect");
      } catch {
        /* already closed */
      }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private emitEvent(type: string, data: Record<string, unknown>): void {
    this.onEvent({
      type,
      data,
      receivedAt: Date.now(),
      transport: "websocket",
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send("ping");
        } catch {
          /* ignore */
        }
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// ---------------------------------------------------------------------------
// SSE Transport
// ---------------------------------------------------------------------------

export class SSETransport implements ITransport {
  readonly type: TransportType = "sse";
  private eventSource: EventSource | null = null;

  constructor(
    private apiUrl: string,
    private apiKey: string,
    private onEvent: TransportEventHandler,
    private onStatus: TransportStatusHandler
  ) {}

  connect(): void {
    this.disconnect();

    try {
      // Use our Next.js SSE proxy to avoid CORS and add auth
      const sseUrl = `/api/sse?apiUrl=${encodeURIComponent(this.apiUrl)}&apiKey=${encodeURIComponent(this.apiKey)}`;

      this.onStatus("connecting", { transport: "sse" });
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.onStatus("connected", { transport: "sse" });
      };

      // Listen for the connected event from our SSE proxy
      this.eventSource.addEventListener("connected", ((ev: MessageEvent) => {
        this.handleMessage(ev.data, "connection.established");
      }) as EventListener);

      // Listen for error events from proxy
      this.eventSource.addEventListener("error", ((ev: MessageEvent) => {
        if (ev.data) {
          this.handleMessage(ev.data, "system.error");
        }
      }) as EventListener);

      // Listen for disconnected events
      this.eventSource.addEventListener("disconnected", ((ev: MessageEvent) => {
        this.handleMessage(ev.data, "connection.lost");
        this.onStatus("error", {
          transport: "sse",
          error: "Upstream SSE connection closed",
        });
      }) as EventListener);

      // Default message handler for untyped events
      this.eventSource.onmessage = (ev) => {
        this.handleMessage(ev.data);
      };

      // Register listeners for known OpenClaw event types
      const eventTypes = [
        "agent.status",
        "agent.created",
        "agent.updated",
        "agent.deleted",
        "agent_status_change",
        "conversation.message",
        "conversation.created",
        "conversation.updated",
        "skill.updated",
        "provider.updated",
        "channel.updated",
        "webhook.fired",
        "plugin.updated",
        "cron.fired",
        "system.health",
      ];
      for (const type of eventTypes) {
        this.eventSource.addEventListener(type, ((ev: MessageEvent) => {
          this.handleMessage(ev.data, type);
        }) as EventListener);
      }

      this.eventSource.onerror = () => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.onStatus("error", {
            transport: "sse",
            error: "SSE connection closed",
          });
          this.eventSource = null;
        } else {
          // EventSource will auto-reconnect
          this.onStatus("reconnecting", { transport: "sse" });
        }
      };
    } catch (err) {
      this.onStatus("error", {
        transport: "sse",
        error: err instanceof Error ? err.message : "SSE creation failed",
      });
    }
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  private handleMessage(data: string, eventType?: string): void {
    try {
      const parsed = JSON.parse(data);
      const type = eventType || parsed.type || parsed.event || "message";
      const eventData =
        typeof parsed.data === "object" && parsed.data !== null
          ? parsed.data
          : parsed;
      this.onEvent({
        type,
        data: eventData,
        receivedAt: Date.now(),
        transport: "sse",
      });
    } catch {
      if (data !== ":keepalive" && data?.trim()) {
        this.onEvent({
          type: eventType || "system.raw",
          data: { raw: data },
          receivedAt: Date.now(),
          transport: "sse",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Transport Probing
// ---------------------------------------------------------------------------

/**
 * Probe whether the OpenClaw instance supports WebSocket connections.
 * Opens a WebSocket with a short timeout — resolves true if it connects.
 */
export function probeWebSocket(
  apiUrl: string,
  apiKey: string,
  timeoutMs = 5000
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof WebSocket === "undefined") {
      resolve(false);
      return;
    }

    let resolved = false;
    const done = (result: boolean, ws?: WebSocket) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
        if (ws) {
          try {
            ws.close(1000);
          } catch {
            /* ignore */
          }
        }
      }
    };

    const timer = setTimeout(() => done(false), timeoutMs);

    try {
      const wsUrl = apiUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
      const ws = new WebSocket(
        `${wsUrl}/api/v1/ws/events?api_key=${encodeURIComponent(apiKey)}`
      );
      ws.onopen = () => {
        clearTimeout(timer);
        done(true, ws);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        done(false);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        done(false);
      };
    } catch {
      clearTimeout(timer);
      done(false);
    }
  });
}

/**
 * Probe whether the OpenClaw instance supports SSE via our proxy.
 * Makes a quick fetch to the SSE endpoint — resolves true if it responds.
 */
export async function probeSSE(
  apiUrl: string,
  apiKey: string,
  timeoutMs = 8000
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(
      `/api/sse?apiUrl=${encodeURIComponent(apiUrl)}&apiKey=${encodeURIComponent(apiKey)}`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      }
    );

    clearTimeout(timer);

    // If we get a response, check if it's a valid SSE stream
    if (response.ok || response.status === 200) {
      // Read just enough to verify it's streaming
      const reader = response.body?.getReader();
      if (reader) {
        try {
          // Read first chunk to confirm SSE is working
          const readTimer = setTimeout(() => reader.cancel(), 3000);
          const { done } = await reader.read();
          clearTimeout(readTimer);
          reader.cancel();
          return !done; // Got data = SSE works
        } catch {
          try { reader.cancel(); } catch { /* ignore */ }
          return false;
        }
      }
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// TransportManager — Orchestrates detection & fallback
// ---------------------------------------------------------------------------

export interface TransportManagerConfig {
  /** Polling interval in ms (for polling fallback) */
  pollInterval?: number;
  /** WebSocket probe timeout in ms */
  wsProbeTimeout?: number;
  /** Force a specific transport (skip auto-detection) */
  forceTransport?: TransportType;
}

/**
 * TransportManager handles automatic transport detection and fallback.
 * It provides a unified event interface regardless of which transport is active.
 *
 * Usage:
 *   const tm = new TransportManager(onEvent, onStatus, config);
 *   await tm.connect();  // Auto-detects best transport
 *   tm.disconnect();     // Clean shutdown
 *   tm.destroy();        // Permanent cleanup
 */
export class TransportManager {
  private transport: ITransport | null = null;
  private _activeTransport: TransportType | null = null;
  private _status: TransportStatus = "disconnected";
  private destroyed = false;
  private config: Required<TransportManagerConfig>;

  /** Which transport was detected as available (null = not yet probed) */
  private detectedTransport: TransportType | null = null;

  constructor(
    private onEvent: TransportEventHandler,
    private onStatus: TransportStatusHandler,
    config: TransportManagerConfig = {}
  ) {
    this.config = {
      pollInterval: config.pollInterval ?? 5000,
      wsProbeTimeout: config.wsProbeTimeout ?? 5000,
      forceTransport: config.forceTransport ?? ("" as TransportType),
    };
  }

  /** Current transport type */
  get activeTransport(): TransportType | null {
    return this._activeTransport;
  }

  /** Current status */
  get status(): TransportStatus {
    return this._status;
  }

  /**
   * Connect using automatic transport detection.
   * Probes WebSocket → SSE → falls back to polling.
   */
  async connect(): Promise<TransportType> {
    if (this.destroyed) return "polling";

    const { apiUrl, apiKey } = getConnectionConfig();
    if (!apiUrl || !apiKey) {
      this.updateStatus("disconnected", "polling", "No API configuration");
      return "polling";
    }

    // If forced transport, skip detection
    if (this.config.forceTransport) {
      this.connectTransport(this.config.forceTransport, apiUrl, apiKey);
      return this.config.forceTransport;
    }

    // If we already detected a transport before, reuse it
    if (this.detectedTransport) {
      this.connectTransport(this.detectedTransport, apiUrl, apiKey);
      return this.detectedTransport;
    }

    this.updateStatus("connecting", "websocket");

    // Probe WebSocket
    const wsOk = await probeWebSocket(
      apiUrl,
      apiKey,
      this.config.wsProbeTimeout
    );
    if (this.destroyed) return "polling";

    if (wsOk) {
      this.detectedTransport = "websocket";
      this.connectTransport("websocket", apiUrl, apiKey);
      return "websocket";
    }

    // Probe SSE
    this.updateStatus("connecting", "sse");
    const sseOk = await probeSSE(apiUrl, apiKey);
    if (this.destroyed) return "polling";

    if (sseOk) {
      this.detectedTransport = "sse";
      this.connectTransport("sse", apiUrl, apiKey);
      return "sse";
    }

    // Fall back to polling (always available)
    this.detectedTransport = "polling";
    this.connectTransport("polling", apiUrl, apiKey);
    return "polling";
  }

  /** Disconnect the active transport */
  disconnect(): void {
    if (this.transport) {
      this.transport.disconnect();
      this.transport = null;
    }
    this._activeTransport = null;
    this._status = "disconnected";
  }

  /** Permanently destroy this manager */
  destroy(): void {
    this.destroyed = true;
    this.disconnect();
  }

  /** Check if a transport is currently connected */
  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }

  /** Reset detected transport (e.g., when settings change) */
  resetDetection(): void {
    this.detectedTransport = null;
  }

  /**
   * Fall back to the next transport in the chain.
   * websocket → sse → polling
   */
  fallback(apiUrl: string, apiKey: string): TransportType | null {
    const order: TransportType[] = ["websocket", "sse", "polling"];
    const currentIdx = this._activeTransport
      ? order.indexOf(this._activeTransport)
      : -1;
    const nextIdx = currentIdx + 1;

    if (nextIdx >= order.length) return null; // no more fallbacks

    const nextTransport = order[nextIdx];
    this.detectedTransport = nextTransport;
    this.disconnect();
    this.connectTransport(nextTransport, apiUrl, apiKey);
    return nextTransport;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private connectTransport(
    type: TransportType,
    apiUrl: string,
    apiKey: string
  ): void {
    this.disconnect();

    const eventHandler: TransportEventHandler = (event) => {
      if (!this.destroyed) {
        this.onEvent(event);
      }
    };

    const statusHandler: TransportStatusHandler = (status, details) => {
      if (this.destroyed) return;

      this._status = status;

      // On error, try falling back to next transport
      if (status === "error" && type !== "polling") {
        const next = this.fallback(apiUrl, apiKey);
        if (next) {
          this.updateStatus(
            "reconnecting",
            next,
            `${type} failed, falling back to ${next}`
          );
          return;
        }
      }

      this.onStatus(status, details);
    };

    switch (type) {
      case "websocket":
        this.transport = new WebSocketTransport(
          apiUrl,
          apiKey,
          eventHandler,
          statusHandler
        );
        break;
      case "sse":
        this.transport = new SSETransport(
          apiUrl,
          apiKey,
          eventHandler,
          statusHandler
        );
        break;
      case "polling":
        // Polling doesn't use a persistent transport — it's handled by ConnectionManager
        // We just signal that polling is the active transport
        this._activeTransport = "polling";
        this._status = "connected";
        this.onStatus("connected", { transport: "polling" });
        return;
    }

    this._activeTransport = type;
    this.transport!.connect();
  }

  private updateStatus(
    status: TransportStatus,
    transport: TransportType,
    error?: string
  ): void {
    this._status = status;
    this._activeTransport = transport;
    this.onStatus(status, { transport, error });
  }
}
