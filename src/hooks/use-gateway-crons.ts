"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Cron job entry from gateway `cron.list` RPC method.
 */
export interface GatewayCronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  command?: string;
  description?: string;
  timezone?: string;
  lastRun?: string;
  nextRun?: string;
  status?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewayCronsState {
  items: GatewayCronJob[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing cron jobs via gateway RPC.
 *
 * Methods:
 * - `cron.list` — list all cron jobs
 * - `cron.add` — create a new cron job
 * - `cron.update` — update an existing cron job
 * - `cron.remove` — delete a cron job
 * - `cron.run` — manually trigger a cron job
 */
export function useGatewayCrons() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayCronsState>({
    items: [],
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchItems = useCallback(async () => {
    if (!isConnected) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await sendRequest("cron.list");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        const raw = (r.jobs ?? r.crons ?? r.items ?? r.data ?? r) as unknown;
        let items: GatewayCronJob[] = [];
        if (Array.isArray(raw)) {
          items = raw.map(normalizeCron);
        }
        setState({ items, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch cron jobs",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch cron jobs",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  const addCron = useCallback(
    async (params: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await sendRequest("cron.add", params);
        if (res.ok) {
          await fetchItems();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to add cron job",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to add cron job",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchItems]
  );

  const updateCron = useCallback(
    async (id: string, params: Record<string, unknown>): Promise<boolean> => {
      try {
        const res = await sendRequest("cron.update", { id, ...params });
        if (res.ok) {
          await fetchItems();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to update cron job",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to update cron job",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchItems]
  );

  const removeCron = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await sendRequest("cron.remove", { id });
        if (res.ok) {
          if (mountedRef.current) {
            setState((s) => ({
              ...s,
              items: s.items.filter((item) => item.id !== id),
            }));
          }
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to remove cron job",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to remove cron job",
          }));
        }
        return false;
      }
    },
    [sendRequest]
  );

  const runCron = useCallback(
    async (id: string, mode: "force" | "due" = "force"): Promise<boolean> => {
      try {
        const res = await sendRequest("cron.run", { id, mode });
        return res.ok;
      } catch {
        return false;
      }
    },
    [sendRequest]
  );

  useEffect(() => {
    if (isConnected) {
      fetchItems();
    }
  }, [isConnected, fetchItems]);

  return {
    ...state,
    fetchItems,
    addCron,
    updateCron,
    removeCron,
    runCron,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCron(raw: unknown): GatewayCronJob {
  if (!raw || typeof raw !== "object") {
    return {
      id: "unknown",
      name: "unknown",
      schedule: "",
      enabled: false,
    };
  }
  const r = raw as Record<string, unknown>;
  return {
    id: (r.id ?? r.key ?? "unknown") as string,
    name: (r.name ?? r.label ?? "Unnamed") as string,
    schedule: (r.schedule ?? r.cron ?? r.expression ?? "") as string,
    enabled: Boolean(r.enabled ?? r.active ?? true),
    command: (r.command ?? r.action ?? r.task) as string | undefined,
    description: r.description as string | undefined,
    timezone: r.timezone as string | undefined,
    lastRun: (r.lastRun ?? r.lastRunAt ?? r.last_run) as string | undefined,
    nextRun: (r.nextRun ?? r.nextRunAt ?? r.next_run) as string | undefined,
    status: r.status as string | undefined,
    config: r.config as Record<string, unknown> | undefined,
    ...r,
  };
}
