"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

interface GatewayConfigState {
  raw: string;
  baseHash: string;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for reading/writing the OpenClaw config via gateway RPC.
 *
 * Methods:
 * - `config.get` — retrieve the current YAML config + base hash
 * - `config.set` — save config with optimistic locking (baseHash)
 */
export function useGatewayConfig() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayConfigState>({
    raw: "",
    baseHash: "",
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!isConnected) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await sendRequest("config.get");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        setState({
          raw: (r.raw ?? r.config ?? r.yaml ?? "") as string,
          baseHash: (r.baseHash ?? r.hash ?? "") as string,
          loading: false,
          error: null,
        });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch config",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch config",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  const saveConfig = useCallback(
    async (raw: string): Promise<boolean> => {
      try {
        const res = await sendRequest("config.set", {
          raw,
          baseHash: state.baseHash,
        });
        if (res.ok) {
          // Update local state with new hash
          if (res.result) {
            const r = res.result as Record<string, unknown>;
            if (mountedRef.current) {
              setState((s) => ({
                ...s,
                raw,
                baseHash: (r.baseHash ?? r.hash ?? s.baseHash) as string,
                error: null,
              }));
            }
          }
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to save config",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to save config",
          }));
        }
        return false;
      }
    },
    [sendRequest, state.baseHash]
  );

  useEffect(() => {
    if (isConnected) {
      fetchConfig();
    }
  }, [isConnected, fetchConfig]);

  return {
    ...state,
    fetchConfig,
    saveConfig,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}
