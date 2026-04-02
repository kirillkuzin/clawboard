"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Agent entry from the gateway `agents.list` RPC method.
 */
export interface GatewayAgent {
  id: string;
  name: string;
  description?: string;
  emoji?: string;
  avatar?: string;
  model?: string;
  fallbackModel?: string;
  systemPrompt?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewayAgentsState {
  agents: GatewayAgent[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing agents via gateway RPC.
 *
 * Methods:
 * - `agents.list` — list all agents
 * - `agents.create` — create new agent (admin)
 * - `agents.update` — update agent (admin)
 * - `agents.delete` — delete agent (admin)
 */
export function useGatewayAgents() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayAgentsState>({
    agents: [],
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchAgents = useCallback(async () => {
    if (!isConnected) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await sendRequest("agents.list");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        const raw = (r.agents ?? r.items ?? r.data ?? r) as unknown;
        let agents: GatewayAgent[] = [];
        if (Array.isArray(raw)) {
          agents = raw.map(normalizeAgent);
        }
        setState({ agents, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch agents",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch agents",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  const createAgent = useCallback(
    async (params: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await sendRequest("agents.create", params);
        if (res.ok) {
          await fetchAgents();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to create agent",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to create agent",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchAgents]
  );

  const updateAgent = useCallback(
    async (params: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await sendRequest("agents.update", params);
        if (res.ok) {
          await fetchAgents();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to update agent",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to update agent",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchAgents]
  );

  const deleteAgent = useCallback(
    async (agentId: string): Promise<boolean> => {
      try {
        const res = await sendRequest("agents.delete", { agentId });
        if (res.ok) {
          await fetchAgents();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to delete agent",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to delete agent",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchAgents]
  );

  useEffect(() => {
    if (isConnected) {
      fetchAgents();
    }
  }, [isConnected, fetchAgents]);

  return {
    ...state,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeAgent(raw: unknown): GatewayAgent {
  if (!raw || typeof raw !== "object") {
    return { id: "unknown", name: "Unknown" };
  }
  const r = raw as Record<string, unknown>;
  return {
    id: (r.id ?? r.agentId ?? "unknown") as string,
    name: (r.name ?? r.label ?? "Unnamed") as string,
    description: r.description as string | undefined,
    emoji: r.emoji as string | undefined,
    avatar: (r.avatar ?? r.avatarUrl) as string | undefined,
    model: (r.model ?? r.primaryModel) as string | undefined,
    fallbackModel: r.fallbackModel as string | undefined,
    systemPrompt: (r.systemPrompt ?? r.system) as string | undefined,
    status: r.status as string | undefined,
    createdAt: (r.createdAt ?? r.created) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated) as string | undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    ...r,
  };
}
