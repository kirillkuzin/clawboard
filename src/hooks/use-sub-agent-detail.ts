"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { openclawFetch } from "@/lib/api-client";
import type { SubAgent } from "@/lib/types";

export interface SubAgentActivity {
  id: string;
  type: string;
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface SubAgentDetailData extends SubAgent {
  activities?: SubAgentActivity[];
  logs?: string[];
  skills_used?: string[];
  tokens_used?: number;
  duration_ms?: number;
  memory_usage_mb?: number;
  child_agents?: { id: string; name: string; status: string }[];
}

interface UseSubAgentDetailReturn {
  agent: SubAgentDetailData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  stopAgent: () => Promise<boolean>;
  killAgent: () => Promise<boolean>;
  stopping: boolean;
  killing: boolean;
}

/**
 * Hook to fetch a single sub-agent's full detail from the OpenClaw API.
 * Polls every 5 seconds for live updates while agent is running/waiting.
 */
export function useSubAgentDetail(
  agentId: string | null
): UseSubAgentDetailReturn {
  const [agent, setAgent] = useState<SubAgentDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [killing, setKilling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const fetchDetail = useCallback(async (isPolling = false) => {
    if (!agentId) return;
    if (!isPolling) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await openclawFetch(`/agents/${agentId}`);
      if (!response.ok) {
        throw new Error(
          `API error: ${response.status} ${response.statusText}`
        );
      }
      const data = await response.json();
      if (mountedRef.current) {
        setAgent(data as SubAgentDetailData);
        initialLoadDoneRef.current = true;
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch agent details";
        setError(msg);
      }
    } finally {
      if (mountedRef.current && !isPolling) {
        setLoading(false);
      }
    }
  }, [agentId]);

  const stopAgent = useCallback(async (): Promise<boolean> => {
    if (!agentId) return false;
    setStopping(true);
    try {
      const response = await openclawFetch(`/agents/${agentId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          `Failed to stop agent: ${response.status} ${response.statusText}`
        );
      }
      // Refresh after stopping
      await fetchDetail();
      return true;
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to stop agent";
        setError(msg);
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setStopping(false);
      }
    }
  }, [agentId, fetchDetail]);

  const killAgent = useCallback(async (): Promise<boolean> => {
    if (!agentId) return false;
    setKilling(true);
    try {
      const response = await openclawFetch(`/agents/${agentId}/kill`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          `Failed to kill agent: ${response.status} ${response.statusText}`
        );
      }
      // Refresh after killing
      await fetchDetail();
      return true;
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to kill agent";
        setError(msg);
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setKilling(false);
      }
    }
  }, [agentId, fetchDetail]);

  useEffect(() => {
    mountedRef.current = true;
    initialLoadDoneRef.current = false;
    if (agentId) {
      fetchDetail(false);
    } else {
      setAgent(null);
      setError(null);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [agentId, fetchDetail]);

  // Poll every 5s for active agents
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    const isActive =
      agent?.status === "running" || agent?.status === "waiting";
    if (agentId && isActive) {
      pollingRef.current = setInterval(() => fetchDetail(true), 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [agentId, agent?.status, fetchDetail]);

  return {
    agent,
    loading,
    error,
    refresh: () => fetchDetail(false),
    stopAgent,
    killAgent,
    stopping,
    killing,
  };
}
