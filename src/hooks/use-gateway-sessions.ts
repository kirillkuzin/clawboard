"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useGateway } from "@/components/providers/gateway-provider";

/**
 * Session entry from the gateway `sessions.list` RPC method.
 */
export interface GatewaySession {
  key: string;
  label?: string;
  channel?: string;
  agentId?: string;
  agentName?: string;
  status?: string;
  messageCount?: number;
  lastMessageAt?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Chat message from `chat.history` RPC method.
 */
export interface GatewayChatMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

interface GatewaySessionsState {
  sessions: GatewaySession[];
  loading: boolean;
  error: string | null;
  total: number;
}

/**
 * Hook for listing sessions via gateway RPC `sessions.list`.
 */
export function useGatewaySessions() {
  const { sendRequest, isConnected } = useGateway();
  const [state, setState] = useState<GatewaySessionsState>({
    sessions: [],
    loading: false,
    error: null,
    total: 0,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!isConnected) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await sendRequest("sessions.list", {
        includeGlobal: true,
        limit: 100,
      });
      if (!mountedRef.current) return;
      if (res.ok && res.result) {
        const r = res.result as Record<string, unknown>;
        const raw = (r.sessions ?? r.items ?? r.data ?? r) as unknown;
        let sessions: GatewaySession[] = [];
        if (Array.isArray(raw)) {
          sessions = raw.map(normalizeSession);
        }
        setState({
          sessions,
          loading: false,
          error: null,
          total: sessions.length,
        });
      } else {
        setState((s) => ({
          ...s,
          loading: false,
          error: res.error?.message ?? "Failed to fetch sessions",
        }));
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch sessions",
        }));
      }
    }
  }, [sendRequest, isConnected]);

  useEffect(() => {
    if (isConnected) {
      fetchSessions();
    }
  }, [isConnected, fetchSessions]);

  return {
    ...state,
    refresh: fetchSessions,
  };
}

/**
 * Hook for fetching a single session detail and chat history.
 */
export function useGatewaySessionDetail(sessionKey: string | null) {
  const { sendRequest, isConnected } = useGateway();
  const [session, setSession] = useState<GatewaySession | null>(null);
  const [messages, setMessages] = useState<GatewayChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!isConnected || !sessionKey) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch session info and chat history in parallel
      const [sessionRes, historyRes] = await Promise.allSettled([
        sendRequest("sessions.get", { key: sessionKey }),
        sendRequest("chat.history", { sessionKey, limit: 100 }),
      ]);

      if (!mountedRef.current) return;

      if (sessionRes.status === "fulfilled" && sessionRes.value.ok && sessionRes.value.result) {
        setSession(normalizeSession(sessionRes.value.result));
      }

      if (historyRes.status === "fulfilled" && historyRes.value.ok && historyRes.value.result) {
        const r = historyRes.value.result as Record<string, unknown>;
        const raw = (r.messages ?? r.entries ?? r.history ?? r.data ?? r) as unknown;
        if (Array.isArray(raw)) {
          setMessages(raw.map(normalizeMessage));
        }
      }

      setLoading(false);
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to fetch session");
        setLoading(false);
      }
    }
  }, [sendRequest, isConnected, sessionKey]);

  // Auto-fetch and poll every 5s
  useEffect(() => {
    if (!sessionKey || !isConnected) return;
    fetchDetail();
    const timer = setInterval(fetchDetail, 5000);
    return () => clearInterval(timer);
  }, [sessionKey, isConnected, fetchDetail]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!sessionKey) return false;
      try {
        const res = await sendRequest("chat.send", {
          sessionKey,
          message,
        });
        if (res.ok) {
          await fetchDetail();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [sendRequest, sessionKey, fetchDetail]
  );

  const deleteSession = useCallback(async () => {
    if (!sessionKey) return false;
    try {
      const res = await sendRequest("sessions.delete", {
        key: sessionKey,
        deleteTranscript: true,
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [sendRequest, sessionKey]);

  const resetSession = useCallback(async () => {
    if (!sessionKey) return false;
    try {
      const res = await sendRequest("sessions.reset", { key: sessionKey });
      if (res.ok) {
        setMessages([]);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [sendRequest, sessionKey]);

  return {
    session,
    messages,
    loading,
    error,
    refresh: fetchDetail,
    sendMessage,
    deleteSession,
    resetSession,
  };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeSession(raw: unknown): GatewaySession {
  if (!raw || typeof raw !== "object") {
    return { key: "unknown" };
  }
  const r = raw as Record<string, unknown>;
  return {
    key: (r.key ?? r.sessionKey ?? r.id ?? "unknown") as string,
    label: (r.label ?? r.title ?? r.name) as string | undefined,
    channel: (r.channel ?? r.lastChannel) as string | undefined,
    agentId: r.agentId as string | undefined,
    agentName: (r.agentName ?? r.agent) as string | undefined,
    status: (r.status ?? (r.active ? "active" : undefined)) as string | undefined,
    messageCount: r.messageCount as number | undefined,
    lastMessageAt: (r.lastMessageAt ?? r.updatedAt ?? r.lastActivity) as string | undefined,
    createdAt: (r.createdAt ?? r.created) as string | undefined,
    updatedAt: (r.updatedAt ?? r.updated) as string | undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    ...r,
  };
}

function normalizeMessage(raw: unknown): GatewayChatMessage {
  if (!raw || typeof raw !== "object") {
    return { role: "unknown", content: "" };
  }
  const r = raw as Record<string, unknown>;
  return {
    role: (r.role ?? r.sender ?? "unknown") as string,
    content: (r.content ?? r.text ?? r.message ?? "") as string | Array<{ type: string; text?: string }>,
    timestamp: (r.timestamp ?? r.createdAt ?? r.ts) as string | undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    ...r,
  };
}
