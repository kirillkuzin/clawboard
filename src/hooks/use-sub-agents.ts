"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { openclawFetch } from "@/lib/api-client";
import type { SubAgent, SubAgentListResponse } from "@/lib/types";

interface UseSubAgentsReturn {
  agents: SubAgent[];
  loading: boolean;
  error: string | null;
  total: number;
  refresh: () => void;
}

/**
 * Hook to fetch the list of sub-agents from the OpenClaw API.
 * Polls every 10 seconds for live updates.
 */
export function useSubAgents(
  page: number = 1,
  pageSize: number = 50
): UseSubAgentsReturn {
  const [agents, setAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await openclawFetch(
        `/agents?page=${page}&page_size=${pageSize}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data: SubAgentListResponse = await response.json();
      if (mountedRef.current) {
        setAgents(data.agents ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch sub-agents";
        setError(msg);
        setAgents([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAgents();

    // Poll every 10s for live updates
    pollingRef.current = setInterval(fetchAgents, 10000);

    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchAgents]);

  return { agents, loading, error, total, refresh: fetchAgents };
}
