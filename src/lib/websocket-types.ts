/**
 * WebSocket connection types for OpenClaw real-time communication.
 */

/** WebSocket connection states */
export type WebSocketState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

/** Configuration for WebSocket connection */
export interface WebSocketConfig {
  /** WebSocket URL (derived from API URL, e.g., ws://localhost:8000/ws) */
  url: string;
  /** API key for authentication */
  apiKey: string;
  /** Path to append to the base URL (default: "/ws") */
  path?: string;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Heartbeat timeout in ms - if no pong received within this time, reconnect (default: 10000) */
  heartbeatTimeout?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Reconnect backoff multiplier (default: 1.5) */
  reconnectMultiplier?: number;
  /** Maximum reconnect attempts before entering "failed" state (default: Infinity) */
  maxReconnectAttempts?: number;
}

/** Incoming WebSocket message from OpenClaw */
export interface WebSocketMessage<T = unknown> {
  /** Message type/event identifier */
  type: string;
  /** Message payload */
  data: T;
  /** Server timestamp (ISO 8601) */
  timestamp?: string;
}

/** Heartbeat (ping) message */
export interface HeartbeatMessage {
  type: "ping";
  timestamp: string;
}

/** Heartbeat response (pong) message */
export interface HeartbeatResponse {
  type: "pong";
  timestamp: string;
}

/** Authentication message sent on connect */
export interface AuthMessage {
  type: "auth";
  apiKey: string;
}

/** Connection state details exposed to consumers */
export interface ConnectionState {
  /** Current connection state */
  state: WebSocketState;
  /** Number of reconnect attempts since last successful connection */
  reconnectAttempts: number;
  /** Timestamp of last successful connection */
  lastConnectedAt: number | null;
  /** Timestamp of last received message */
  lastMessageAt: number | null;
  /** Last error message, if any */
  lastError: string | null;
  /** Round-trip latency from last heartbeat in ms */
  latencyMs: number | null;
}

/** Event handler types for the WebSocket manager */
export interface WebSocketEventHandlers {
  onMessage?: (message: WebSocketMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
  onError?: (error: Event | Error) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
}

/** Default configuration values */
export const WS_DEFAULTS = {
  path: "/ws",
  heartbeatInterval: 30_000,
  heartbeatTimeout: 10_000,
  reconnectDelay: 1_000,
  maxReconnectDelay: 30_000,
  reconnectMultiplier: 1.5,
  maxReconnectAttempts: 20,
} as const;
