"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Tool/plugin entry from gateway `tools.catalog` RPC method.
 */
export interface GatewayTool {
  id: string;
  name: string;
  description?: string;
  type?: string;
  source?: string;
  enabled: boolean;
  version?: string;
  author?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewayToolsState {
  items: GatewayTool[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for listing tools/plugins via gateway RPC.
 * Read-only view of the tools catalog.
 *
 * Method: `tools.catalog`
 */
export function useGatewayTools() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayToolsState>({
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
      const res = await sendRequest("tools.catalog");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        const raw = (r.tools ?? r.catalog ?? r.items ?? r.data ?? r) as unknown;
        let items: GatewayTool[] = [];
        if (Array.isArray(raw)) {
          items = raw.map((item) => normalizeTool(item));
        } else if (typeof raw === "object" && raw !== null) {
          // Could be a map of toolName → tool
          items = Object.entries(raw as Record<string, unknown>).map(
            ([key, value]) => normalizeTool(value, key)
          );
        }
        setState({ items, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch tools",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch tools",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchItems();
    }
  }, [isConnected, fetchItems]);

  return {
    ...state,
    fetchItems,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTool(raw: unknown, key?: string): GatewayTool {
  if (!raw || typeof raw !== "object") {
    return {
      id: key ?? "unknown",
      name: key ?? "unknown",
      enabled: false,
    };
  }
  const r = raw as Record<string, unknown>;
  const name = (r.name ?? r.label ?? key ?? "unknown") as string;
  return {
    id: (r.id ?? r.key ?? key ?? name) as string,
    name,
    description: r.description as string | undefined,
    type: (r.type ?? r.kind ?? r.category) as string | undefined,
    source: (r.source ?? r.plugin ?? r.origin) as string | undefined,
    enabled: Boolean(r.enabled ?? r.active ?? true),
    version: r.version as string | undefined,
    author: r.author as string | undefined,
    config: r.config as Record<string, unknown> | undefined,
    ...r,
  };
}
