"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WebSocketManager } from "@/lib/websocket-manager";
import type {
  WebSocketConfig,
  WebSocketMessage,
  ConnectionState,
  WebSocketState,
} from "@/lib/websocket-types";
import { useSettings } from "./use-settings";

/** Default initial connection state */
const INITIAL_STATE: ConnectionState = {
  state: "disconnected",
  reconnectAttempts: 0,
  lastConnectedAt: null,
  lastMessageAt: null,
  lastError: null,
  latencyMs: null,
};

export interface UseWebSocketOptions {
  /** Whether to auto-connect when settings are available (default: true) */
  autoConnect?: boolean;
  /** WebSocket path (default: "/ws") */
  path?: string;
  /** Heartbeat interval in ms (default: 30000) */
  heartbeatInterval?: number;
  /** Heartbeat timeout in ms (default: 10000) */
  heartbeatTimeout?: number;
  /** Reconnect delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
  /** Max reconnect attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Called on every incoming message */
  onMessage?: (message: WebSocketMessage) => void;
  /** Called when connection state changes */
  onStateChange?: (state: ConnectionState) => void;
  /** Called on error */
  onError?: (error: Event | Error) => void;
}

export interface UseWebSocketReturn {
  /** Current connection state details */
  connectionState: ConnectionState;
  /** Shorthand for connectionState.state */
  state: WebSocketState;
  /** Whether currently connected */
  isConnected: boolean;
  /** Send a message through the WebSocket */
  send: (data: unknown) => boolean;
  /** Manually connect */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
  /** Force reconnect */
  reconnect: () => void;
  /** Last received message */
  lastMessage: WebSocketMessage | null;
}

/**
 * React hook for managing a WebSocket connection to OpenClaw.
 *
 * Reads API URL and API key from the useSettings hook.
 * Handles auto-connect, auto-reconnect, heartbeat, and state tracking.
 *
 * @example
 * ```tsx
 * const { state, isConnected, lastMessage, send } = useWebSocket({
 *   onMessage: (msg) => console.log("Received:", msg),
 * });
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    path,
    heartbeatInterval,
    heartbeatTimeout,
    reconnectDelay,
    maxReconnectDelay,
    maxReconnectAttempts,
    onMessage,
    onStateChange,
    onError,
  } = options;

  const { apiUrl, apiKey, isLoaded } = useSettings();
  const [connectionState, setConnectionState] = useState<ConnectionState>(INITIAL_STATE);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Use refs for callbacks to avoid re-creating the manager on handler changes
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  onMessageRef.current = onMessage;
  onStateChangeRef.current = onStateChange;
  onErrorRef.current = onError;

  // Manager ref
  const managerRef = useRef<WebSocketManager | null>(null);

  // Track previous config to detect changes
  const configRef = useRef({ apiUrl, apiKey });

  // Initialize/update manager when settings load or change
  useEffect(() => {
    if (!isLoaded) return;

    // If no API URL or key, don't connect
    if (!apiUrl || !apiKey) {
      // Clean up existing manager
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
        setConnectionState(INITIAL_STATE);
      }
      return;
    }

    const configChanged =
      configRef.current.apiUrl !== apiUrl || configRef.current.apiKey !== apiKey;
    configRef.current = { apiUrl, apiKey };

    // If manager exists and config changed, update it
    if (managerRef.current && configChanged) {
      managerRef.current.updateConfig({ url: apiUrl, apiKey });
      return;
    }

    // Create new manager if none exists
    if (!managerRef.current) {
      const wsConfig: WebSocketConfig = {
        url: apiUrl,
        apiKey,
        ...(path !== undefined && { path }),
        ...(heartbeatInterval !== undefined && { heartbeatInterval }),
        ...(heartbeatTimeout !== undefined && { heartbeatTimeout }),
        ...(reconnectDelay !== undefined && { reconnectDelay }),
        ...(maxReconnectDelay !== undefined && { maxReconnectDelay }),
        ...(maxReconnectAttempts !== undefined && { maxReconnectAttempts }),
      };

      const manager = new WebSocketManager(wsConfig);

      manager.on({
        onMessage: (msg) => {
          setLastMessage(msg);
          onMessageRef.current?.(msg);
        },
        onStateChange: (state) => {
          setConnectionState(state);
          onStateChangeRef.current?.(state);
        },
        onError: (err) => {
          onErrorRef.current?.(err);
        },
      });

      managerRef.current = manager;

      if (autoConnect) {
        manager.connect();
      }
    }

    // Cleanup on unmount
    return () => {
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, apiUrl, apiKey, autoConnect]);

  const send = useCallback((data: unknown): boolean => {
    return managerRef.current?.send(data) ?? false;
  }, []);

  const connect = useCallback(() => {
    managerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
  }, []);

  const reconnect = useCallback(() => {
    managerRef.current?.reconnect();
  }, []);

  return {
    connectionState,
    state: connectionState.state,
    isConnected: connectionState.state === "connected",
    send,
    connect,
    disconnect,
    reconnect,
    lastMessage,
  };
}
