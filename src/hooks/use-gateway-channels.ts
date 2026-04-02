"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Channel status entry from `channels.status` RPC method.
 */
export interface GatewayChannel {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  enabled: boolean;
  account?: string;
  error?: string;
  lastActivity?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewayChannelsState {
  items: GatewayChannel[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for viewing channel connection status via gateway RPC.
 * Channels in OpenClaw are config-based (not REST-managed), so this is read-only.
 *
 * Method: `channels.status`
 */
export function useGatewayChannels() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewayChannelsState>({
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
      const res = await sendRequest("channels.status", {}, 8000);
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        let channels: GatewayChannel[] = [];

        // May return { channels: [...] } or a map { whatsapp: {...}, telegram: {...} }
        const raw = r.channels ?? r.items ?? r.data ?? r;
        if (Array.isArray(raw)) {
          channels = (raw as unknown[]).map((item) => normalizeChannel(item));
        } else if (typeof raw === "object" && raw !== null) {
          channels = Object.entries(raw as Record<string, unknown>).map(
            ([key, value]) => normalizeChannel(value, key)
          );
        }

        setState({ items: channels, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch channels",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch channels",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  const logoutChannel = useCallback(
    async (channel: string): Promise<boolean> => {
      try {
        const res = await sendRequest("channels.logout", { channel });
        if (res.ok) {
          await fetchItems();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [sendRequest, fetchItems]
  );

  useEffect(() => {
    if (isConnected) {
      fetchItems();
    }
  }, [isConnected, fetchItems]);

  return {
    ...state,
    fetchItems,
    logoutChannel,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeChannel(raw: unknown, key?: string): GatewayChannel {
  if (!raw || typeof raw !== "object") {
    return {
      id: key ?? "unknown",
      name: key ?? "unknown",
      type: key ?? "unknown",
      connected: false,
      enabled: false,
    };
  }
  const r = raw as Record<string, unknown>;
  const name = (r.name ?? r.label ?? key ?? "unknown") as string;
  const type = (r.type ?? r.channel ?? key ?? "unknown") as string;
  return {
    id: (r.id ?? key ?? name) as string,
    name,
    type,
    connected: Boolean(r.connected ?? r.online ?? r.ready),
    enabled: Boolean(r.enabled ?? r.active ?? r.connected ?? true),
    account: r.account as string | undefined,
    error: r.error as string | undefined,
    lastActivity: (r.lastActivity ?? r.lastMessage) as string | undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    ...r,
  };
}
