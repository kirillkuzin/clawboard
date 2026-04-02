"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Skill entry returned by the gateway `skills.status` RPC method.
 * Maps to the OpenClaw skill status report shape.
 */
export interface GatewaySkill {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  installed: boolean;
  /** Skill key used for updates (e.g. "web-search") */
  key?: string;
  apiKey?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewaySkillsState {
  items: GatewaySkill[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing skills via the OpenClaw Gateway WebSocket RPC.
 *
 * Methods used:
 * - `skills.status` — list all skills with their install/enable status
 * - `skills.install` — install a skill by name
 * - `skills.update` — toggle enable/disable or set API key for a skill
 */
export function useGatewaySkills() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewaySkillsState>({
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
      const res = await sendRequest("skills.status");
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        // Gateway may return { skills: [...] } or { items: [...] } or a direct array
        const raw = (r.skills ?? r.items ?? r.data ?? r) as unknown;
        let skills: GatewaySkill[] = [];
        if (Array.isArray(raw)) {
          skills = raw.map((item) => normalizeSkill(item));
        } else if (typeof raw === "object" && raw !== null) {
          // Could be a map of skillKey → status
          skills = Object.entries(raw as Record<string, unknown>).map(
            ([key, value]) => normalizeSkill(value, key)
          );
        }
        setState({ items: skills, loading: false, error: null });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch skills",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch skills",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  const installSkill = useCallback(
    async (name: string): Promise<boolean> => {
      try {
        const res = await sendRequest("skills.install", { name });
        if (res.ok) {
          await fetchItems();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to install skill",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to install skill",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchItems]
  );

  const updateSkill = useCallback(
    async (
      skillKey: string,
      params: { enabled?: boolean; apiKey?: string }
    ): Promise<boolean> => {
      try {
        const res = await sendRequest("skills.update", { skillKey, ...params });
        if (res.ok) {
          await fetchItems();
          return true;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: res.error?.message ?? "Failed to update skill",
          }));
        }
        return false;
      } catch (err) {
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : "Failed to update skill",
          }));
        }
        return false;
      }
    },
    [sendRequest, fetchItems]
  );

  // Auto-fetch when connected
  useEffect(() => {
    if (isConnected) {
      fetchItems();
    }
  }, [isConnected, fetchItems]);

  return {
    ...state,
    fetchItems,
    installSkill,
    updateSkill,
    setError: (error: string | null) =>
      setState((s) => ({ ...s, error })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeSkill(raw: unknown, key?: string): GatewaySkill {
  if (!raw || typeof raw !== "object") {
    return {
      id: key ?? "unknown",
      name: key ?? "unknown",
      enabled: false,
      installed: false,
    };
  }
  const r = raw as Record<string, unknown>;
  const name = (r.name ?? r.label ?? key ?? "unknown") as string;
  return {
    id: (r.id ?? r.key ?? key ?? name) as string,
    name,
    key: (r.key ?? key) as string | undefined,
    description: r.description as string | undefined,
    enabled: Boolean(r.enabled ?? r.active ?? true),
    installed: Boolean(r.installed ?? r.available ?? true),
    apiKey: r.apiKey as string | undefined,
    config: r.config as Record<string, unknown> | undefined,
    ...r,
  };
}
