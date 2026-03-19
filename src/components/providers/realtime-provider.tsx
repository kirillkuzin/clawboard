"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ConnectionManager,
  type ConnectionManagerConfig,
} from "@/lib/connection-manager";
import type { TransportType } from "@/lib/realtime";
import type {
  RealtimeState,
  ConnectionState,
  ActivityEvent,
  AgentInfo,
  ConversationInfo,
  SubAgentInfo,
  ResourceCounts,
} from "@/lib/types/events";

// ── Context Value ─────────────────────────────────────────────

export interface RealtimeContextValue {
  /** Full real-time state snapshot */
  state: RealtimeState;

  /** Connection status shorthand */
  connection: ConnectionState;

  /** All known agents */
  agents: AgentInfo[];

  /** Active conversations */
  conversations: ConversationInfo[];

  /** Active sub-agents */
  subAgents: SubAgentInfo[];

  /** Resource counts for sidebar badges */
  resourceCounts: ResourceCounts;

  /** Rolling buffer of recent activity events */
  recentEvents: ActivityEvent[];

  /** Whether the provider is actively polling */
  isPolling: boolean;

  /** Currently active transport type (websocket | sse | polling) */
  activeTransport: TransportType | null;

  /** Start polling */
  startPolling: () => void;

  /** Stop polling */
  stopPolling: () => void;

  /** Force an immediate data refresh */
  refresh: () => void;
}

// ── Defaults ──────────────────────────────────────────────────

const DEFAULT_CONNECTION: ConnectionState = {
  status: "disconnected",
  lastConnected: null,
  lastError: null,
  reconnectAttempt: 0,
  latencyMs: null,
};

const DEFAULT_RESOURCE_COUNTS: ResourceCounts = {
  skills: 0,
  providers: 0,
  channels: 0,
  webhooks: 0,
  plugins: 0,
  crons: 0,
};

const DEFAULT_STATE: RealtimeState = {
  connection: DEFAULT_CONNECTION,
  agents: [],
  conversations: [],
  subAgents: [],
  resourceCounts: DEFAULT_RESOURCE_COUNTS,
  recentEvents: [],
};

const noop = () => {};

const DEFAULT_CONTEXT: RealtimeContextValue = {
  state: DEFAULT_STATE,
  connection: DEFAULT_CONNECTION,
  agents: [],
  conversations: [],
  subAgents: [],
  resourceCounts: DEFAULT_RESOURCE_COUNTS,
  recentEvents: [],
  isPolling: false,
  activeTransport: null,
  startPolling: noop,
  stopPolling: noop,
  refresh: noop,
};

// ── Context ───────────────────────────────────────────────────

export const RealtimeContext =
  createContext<RealtimeContextValue>(DEFAULT_CONTEXT);

// ── Provider Props ────────────────────────────────────────────

export interface RealtimeProviderProps {
  children: React.ReactNode;
  /** Override connection manager config */
  config?: ConnectionManagerConfig;
  /** Auto-start polling on mount (default: true) */
  autoStart?: boolean;
}

// ── Provider Component ────────────────────────────────────────

export function RealtimeProvider({
  children,
  config,
  autoStart = true,
}: RealtimeProviderProps) {
  const [state, setState] = useState<RealtimeState>(DEFAULT_STATE);
  const [isPolling, setIsPolling] = useState(false);
  const [activeTransport, setActiveTransport] = useState<TransportType | null>(null);
  const managerRef = useRef<ConnectionManager | null>(null);

  // Create manager once
  const getManager = useCallback(() => {
    if (!managerRef.current) {
      managerRef.current = new ConnectionManager(config);
    }
    return managerRef.current;
  }, [config]);

  const startPolling = useCallback(() => {
    const manager = getManager();
    manager.onStateChange((newState) => {
      setState(newState);
      // Update active transport from manager
      setActiveTransport(manager.activeTransport);
    });
    manager.start();
    setIsPolling(true);
  }, [getManager]);

  const stopPolling = useCallback(() => {
    managerRef.current?.stop();
    setIsPolling(false);
    setActiveTransport(null);
  }, []);

  const refresh = useCallback(() => {
    managerRef.current?.refresh();
  }, []);

  // Auto-start on mount, cleanup on unmount
  useEffect(() => {
    if (autoStart) {
      // Small delay to let settings load from localStorage
      const timer = setTimeout(() => {
        startPolling();
      }, 500);
      return () => {
        clearTimeout(timer);
        managerRef.current?.destroy();
        managerRef.current = null;
      };
    }
    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [autoStart, startPolling]);

  const value: RealtimeContextValue = {
    state,
    connection: state.connection,
    agents: state.agents,
    conversations: state.conversations,
    subAgents: state.subAgents,
    resourceCounts: state.resourceCounts,
    recentEvents: state.recentEvents,
    isPolling,
    activeTransport,
    startPolling,
    stopPolling,
    refresh,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}
