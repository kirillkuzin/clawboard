/**
 * WebSocket Connection Manager for OpenClaw.
 *
 * Handles:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Automatic reconnection with exponential backoff
 * - Heartbeat ping/pong to detect stale connections
 * - Connection state tracking and event emission
 * - Authentication on connect
 */

import {
  type WebSocketConfig,
  type WebSocketMessage,
  type ConnectionState,
  type WebSocketEventHandlers,
  type WebSocketState,
  WS_DEFAULTS,
} from "./websocket-types";

/**
 * Convert an HTTP(S) URL to a WebSocket URL.
 * e.g., http://localhost:8000 -> ws://localhost:8000
 *       https://api.example.com -> wss://api.example.com
 */
function toWsUrl(httpUrl: string, path: string): string {
  try {
    const url = new URL(httpUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    // Ensure path doesn't double-slash
    const basePath = url.pathname.replace(/\/$/, "");
    url.pathname = `${basePath}${path}`;
    return url.toString();
  } catch {
    // Fallback: simple string replacement
    const wsUrl = httpUrl.replace(/^http/, "ws").replace(/\/$/, "");
    return `${wsUrl}${path}`;
  }
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private handlers: WebSocketEventHandlers = {};

  // Heartbeat state
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingSentAt: number | null = null;

  // Reconnect state
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentReconnectDelay: number;
  private intentionalClose = false;

  // Connection state
  private connectionState: ConnectionState = {
    state: "disconnected",
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastMessageAt: null,
    lastError: null,
    latencyMs: null,
  };

  constructor(config: WebSocketConfig) {
    this.config = {
      ...config,
      path: config.path ?? WS_DEFAULTS.path,
      heartbeatInterval: config.heartbeatInterval ?? WS_DEFAULTS.heartbeatInterval,
      heartbeatTimeout: config.heartbeatTimeout ?? WS_DEFAULTS.heartbeatTimeout,
      reconnectDelay: config.reconnectDelay ?? WS_DEFAULTS.reconnectDelay,
      maxReconnectDelay: config.maxReconnectDelay ?? WS_DEFAULTS.maxReconnectDelay,
      reconnectMultiplier: config.reconnectMultiplier ?? WS_DEFAULTS.reconnectMultiplier,
      maxReconnectAttempts: config.maxReconnectAttempts ?? WS_DEFAULTS.maxReconnectAttempts,
    };
    this.currentReconnectDelay = this.config.reconnectDelay;
  }

  /** Register event handlers */
  on(handlers: WebSocketEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /** Get current connection state */
  getState(): ConnectionState {
    return { ...this.connectionState };
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // Already connected or connecting
    }

    this.intentionalClose = false;
    this.updateState("connecting");

    const wsUrl = toWsUrl(this.config.url, this.config.path);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.connectionState.lastError = error.message;
      this.updateState("disconnected");
      this.handlers.onError?.(error);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connectionState.reconnectAttempts = 0;
      this.connectionState.lastConnectedAt = Date.now();
      this.connectionState.lastError = null;
      this.currentReconnectDelay = this.config.reconnectDelay;
      this.updateState("connected");

      // Send authentication message
      this.send({
        type: "auth",
        apiKey: this.config.apiKey,
      });

      // Start heartbeat
      this.startHeartbeat();

      this.handlers.onOpen?.();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.connectionState.lastMessageAt = Date.now();

      let message: WebSocketMessage;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        // Non-JSON message; wrap it
        message = { type: "raw", data: event.data };
      }

      // Handle pong responses
      if (message.type === "pong") {
        this.handlePong();
        return;
      }

      this.handlers.onMessage?.(message);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();
      this.handlers.onClose?.(event);

      if (!this.intentionalClose) {
        this.connectionState.lastError = event.reason || `Connection closed (code: ${event.code})`;
        this.scheduleReconnect();
      } else {
        this.updateState("disconnected");
      }
    };

    this.ws.onerror = (event: Event) => {
      this.connectionState.lastError = "WebSocket error occurred";
      this.handlers.onError?.(event);
      // onclose will fire after onerror, so reconnect is handled there
    };
  }

  /** Disconnect from the WebSocket server */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.ws) {
      // Only close if not already closed
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }

    this.connectionState.reconnectAttempts = 0;
    this.currentReconnectDelay = this.config.reconnectDelay;
    this.updateState("disconnected");
  }

  /** Send a message through the WebSocket */
  send(data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /** Update the API key (reconnects if currently connected) */
  updateConfig(config: Partial<Pick<WebSocketConfig, "url" | "apiKey">>): void {
    const wasConnected = this.connectionState.state === "connected";

    if (config.url !== undefined) {
      this.config.url = config.url;
    }
    if (config.apiKey !== undefined) {
      this.config.apiKey = config.apiKey;
    }

    if (wasConnected) {
      this.disconnect();
      this.connect();
    }
  }

  /** Force a reconnect */
  reconnect(): void {
    this.disconnect();
    this.intentionalClose = false;
    this.connect();
  }

  /** Destroy the manager and clean up all resources */
  destroy(): void {
    this.disconnect();
    this.handlers = {};
  }

  // --- Private methods ---

  private updateState(state: WebSocketState): void {
    this.connectionState.state = state;
    this.handlers.onStateChange?.({ ...this.connectionState });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.connectionState.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.updateState("failed");
      return;
    }

    this.connectionState.reconnectAttempts++;
    this.updateState("reconnecting");

    // Add jitter: ±25% of the delay
    const jitter = this.currentReconnectDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(this.currentReconnectDelay + jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    // Exponential backoff
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * this.config.reconnectMultiplier,
      this.config.maxReconnectDelay
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingSentAt = Date.now();
        this.send({ type: "ping", timestamp: new Date().toISOString() });

        // Set timeout for pong response
        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.connectionState.lastError = "Heartbeat timeout - no pong received";
          this.connectionState.latencyMs = null;
          // Force close to trigger reconnect
          if (this.ws) {
            this.ws.close(4000, "Heartbeat timeout");
          }
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    this.lastPingSentAt = null;
  }

  private handlePong(): void {
    // Clear timeout
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    // Calculate latency
    if (this.lastPingSentAt) {
      this.connectionState.latencyMs = Date.now() - this.lastPingSentAt;
      this.lastPingSentAt = null;
    }
  }
}
