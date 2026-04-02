"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Model entry from gateway `models.list` RPC method.
 * Compatible with OpenAI-style model listing.
 */
export interface GatewayModel {
  id: string;
  name: string;
  provider?: string;
  ownedBy?: string;
  capabilities?: string[];
  contextWindow?: number;
  pricing?: {
    input?: number;
    output?: number;
  };
  [key: string]: unknown;
}

interface GatewayModelsState {
  models: GatewayModel[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for listing available models via gateway RPC.
 * Read-only — providers/models are configured in the OpenClaw config file.
 *
 * Method: `models.list`
 */
export function useGatewayModels() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayModelsState>({
    models: [],
    loading: false,
    error: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchModels = useCallback(async () => {
    if (!isConnected) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await sendRequest("models.list");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        const raw = (r.models ?? r.data ?? r.items ?? r) as unknown;
        let models: GatewayModel[] = [];
        if (Array.isArray(raw)) {
          models = raw.map(normalizeModel);
        }
        setState({ models, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch models",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch models",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchModels();
    }
  }, [isConnected, fetchModels]);

  return {
    ...state,
    fetchModels,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeModel(raw: unknown): GatewayModel {
  if (!raw || typeof raw !== "object") {
    return { id: "unknown", name: "unknown" };
  }
  const r = raw as Record<string, unknown>;
  const id = (r.id ?? r.modelId ?? "unknown") as string;
  return {
    id,
    name: (r.name ?? r.label ?? id) as string,
    provider: (r.provider ?? r.owned_by ?? r.ownedBy) as string | undefined,
    ownedBy: (r.owned_by ?? r.ownedBy ?? r.provider) as string | undefined,
    capabilities: r.capabilities as string[] | undefined,
    contextWindow: (r.contextWindow ?? r.context_window) as number | undefined,
    pricing: r.pricing as { input?: number; output?: number } | undefined,
    ...r,
  };
}
