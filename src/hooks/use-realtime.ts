"use client";

import { useContext, useMemo } from "react";
import { RealtimeContext } from "@/components/providers/realtime-provider";
import type { RealtimeContextValue } from "@/components/providers/realtime-provider";
import type {
  AgentInfo,
  AgentStatus,
  ConnectionStatus,
  ActivityEventType,
} from "@/lib/types/events";

/**
 * Primary hook to access the full real-time context.
 * Must be used within a <RealtimeProvider>.
 */
export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (ctx === undefined) {
    throw new Error("useRealtime must be used within a <RealtimeProvider>");
  }
  return ctx;
}

/**
 * Hook to get just the connection status, including active transport.
 */
export function useConnectionStatus(): {
  status: ConnectionStatus;
  isConnected: boolean;
  isReconnecting: boolean;
  lastError: string | null;
  latencyMs: number | null;
  transport: string | null;
} {
  const { connection, activeTransport } = useRealtime();
  return useMemo(
    () => ({
      status: connection.status,
      isConnected: connection.status === "connected",
      isReconnecting: connection.status === "reconnecting",
      lastError: connection.lastError,
      latencyMs: connection.latencyMs,
      transport: activeTransport,
    }),
    [connection, activeTransport]
  );
}

/**
 * Hook to get agents, optionally filtered by status.
 */
export function useAgents(statusFilter?: AgentStatus): AgentInfo[] {
  const { agents } = useRealtime();
  return useMemo(() => {
    if (!statusFilter) return agents;
    return agents.filter((a) => a.status === statusFilter);
  }, [agents, statusFilter]);
}

/**
 * Hook to get a single agent by ID.
 */
export function useAgent(agentId: string): AgentInfo | undefined {
  const { agents } = useRealtime();
  return useMemo(
    () => agents.find((a) => a.id === agentId),
    [agents, agentId]
  );
}

/**
 * Hook to get recent activity events, optionally filtered by type.
 */
export function useActivityEvents(
  typeFilter?: ActivityEventType,
  limit?: number
) {
  const { recentEvents } = useRealtime();
  return useMemo(() => {
    let events = recentEvents;
    if (typeFilter) {
      events = events.filter((e) => e.type === typeFilter);
    }
    if (limit) {
      events = events.slice(0, limit);
    }
    return events;
  }, [recentEvents, typeFilter, limit]);
}

/**
 * Hook to get agent summary counts by status.
 */
export function useAgentSummary(): Record<AgentStatus, number> {
  const { agents } = useRealtime();
  return useMemo(() => {
    const counts: Record<AgentStatus, number> = {
      idle: 0,
      busy: 0,
      error: 0,
      offline: 0,
      starting: 0,
    };
    for (const agent of agents) {
      counts[agent.status] = (counts[agent.status] || 0) + 1;
    }
    return counts;
  }, [agents]);
}
