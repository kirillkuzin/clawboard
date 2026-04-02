"use client";

/**
 * useSessionsList – JSON-RPC polling hook for sessions.list data.
 *
 * Fetches active session data from the OpenClaw gateway every 30 seconds via
 * the WebSocket JSON-RPC `sessions.list` method. Supports manual refresh
 * triggering and returns typed session data (model, type, context usage).
 *
 * Usage:
 * ```tsx
 * const { sessions, sessionCount, isLoading, isRefreshing, refresh, lastUpdated, error } =
 *   useSessionsList({
 *     sendRequest,       // from useGatewayMonitor
 *     isAuthenticated,   // only poll when authed
 *     pollIntervalMs: 30_000,
 *   });
 * ```
 *
 * Response parsing:
 * The hook expects the gateway `sessions.list` response to contain:
 *   { sessions: [...], count?, totalContextTokens? }
 * Each session entry may include: id, model, type, contextUsage,
 * agent, started, status, tokensUsed, maxContextWindow.
 * Missing fields are normalized to safe defaults.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { GatewayResponse } from "@/lib/gateway-types";
import type { ActiveSessionsData } from "@/components/monitoring/monitoring-dashboard";

// ---------------------------------------------------------------------------
// Types – Session Data
// ---------------------------------------------------------------------------

/** Individual session entry from the gateway */
export interface GatewaySession {
  /** Unique session identifier */
  id: string;
  /** Model being used (e.g., "claude-sonnet-4-20250514", "gpt-4o") */
  model: string;
  /** Session type (e.g., "conversation", "agent", "tool-use", "streaming") */
  type: string;
  /** Context window usage for this session */
  contextUsage: SessionContextUsage;
  /** Agent/user display name associated with this session */
  agent: string;
  /** ISO 8601 timestamp when the session started */
  started: string;
  /** Current session status */
  status: "active" | "idle" | "completing" | "error";
  /** Total tokens consumed in this session so far */
  tokensUsed: number;
  /** Maximum context window size for the model */
  maxContextWindow: number;
}

/** Context usage metrics for a single session */
export interface SessionContextUsage {
  /** Tokens currently in the context window */
  usedTokens: number;
  /** Maximum context window size */
  maxTokens: number;
  /** Usage as a percentage (0–100) */
  percent: number;
}

/** Parsed sessions list response */
export interface SessionsListData {
  /** All active sessions */
  sessions: GatewaySession[];
  /** Total count of active sessions */
  count: number;
  /** Aggregate context token usage across all sessions */
  totalContextTokens: number;
}

/** Options for the useSessionsList hook */
export interface UseSessionsListOptions {
  /**
   * Function to send a JSON-RPC request over the gateway WebSocket.
   * Typically obtained from useGatewayMonitor's `sendRequest`.
   */
  sendRequest: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<GatewayResponse>;
  /** Whether the WS connection is authenticated and ready for requests */
  isAuthenticated: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

/** Return value of the useSessionsList hook */
export interface UseSessionsListReturn {
  /** Parsed sessions data, or undefined if not yet fetched */
  sessionsData: SessionsListData | undefined;
  /** Convenience: number of active sessions */
  sessionCount: number;
  /** Individual sessions array (empty if not yet fetched) */
  sessions: GatewaySession[];
  /** Mapped to legacy ActiveSessionsData for the monitoring dashboard widget */
  activeSessions: ActiveSessionsData | undefined;
  /** Whether the initial fetch is in-flight (no data yet) */
  isLoading: boolean;
  /** Whether a manual refresh is in-flight */
  isRefreshing: boolean;
  /** Trigger a manual refresh of sessions data */
  refresh: () => Promise<void>;
  /** Timestamp of last successful fetch (ms since epoch), or null */
  lastUpdated: number | null;
  /** Error message from the last failed fetch, or null */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const SESSIONS_METHOD = "sessions.list";
const SESSIONS_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the raw gateway `sessions.list` response into typed SessionsListData.
 *
 * The gateway may return data in various shapes; this normalizer handles:
 * - Standard: `{ sessions: [...], count, totalContextTokens }`
 * - Nested: `{ data: { sessions: [...] } }`
 * - Flat array: `[...sessions]` (result is the array itself)
 * - Legacy: `{ sessions: [...], count }` with minimal session fields
 *
 * All fields are optional and gracefully default.
 */
export function parseSessionsResponse(
  result: Record<string, unknown>
): SessionsListData {
  // Support nested data wrapper
  const data =
    result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : result;

  // Extract sessions array
  const rawSessions = extractSessionsArray(data);
  const sessions = rawSessions.map(parseSession);

  // Count — use explicit count from response or fall back to array length
  const count =
    typeof data.count === "number"
      ? data.count
      : sessions.length;

  // Aggregate context tokens
  const totalContextTokens =
    typeof data.totalContextTokens === "number"
      ? data.totalContextTokens
      : typeof data.total_context_tokens === "number"
        ? data.total_context_tokens
        : sessions.reduce((sum, s) => sum + s.contextUsage.usedTokens, 0);

  return { sessions, count, totalContextTokens };
}

/**
 * Convert parsed SessionsListData to the legacy ActiveSessionsData shape
 * expected by the monitoring dashboard widget.
 */
export function toLegacyActiveSessionsData(
  data: SessionsListData
): ActiveSessionsData {
  return {
    count: data.count,
    sessions: data.sessions.map((s) => ({
      id: s.id,
      agent: s.agent || s.model,
      started: formatRelativeTime(s.started),
      model: s.model,
      type: mapSessionType(s.type),
      contextPercent: s.contextUsage?.percent,
      contextUsed: s.contextUsage?.usedTokens,
      contextTotal: s.contextUsage?.maxTokens,
    })),
  };
}

/**
 * Map raw gateway session type string to the SessionType union.
 * Unknown types are left as undefined (no badge shown).
 */
function mapSessionType(
  rawType: string | undefined
): import("@/components/monitoring/monitoring-dashboard").SessionType | undefined {
  if (!rawType) return undefined;
  const normalized = rawType.toLowerCase();
  if (normalized === "dm" || normalized === "conversation" || normalized === "direct") return "dm";
  if (normalized === "group" || normalized === "channel") return "group";
  if (normalized === "cron" || normalized === "scheduled") return "cron";
  if (normalized === "subagent" || normalized === "agent" || normalized === "tool-use") return "subagent";
  return undefined;
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function extractSessionsArray(
  data: Record<string, unknown>
): Record<string, unknown>[] {
  // Direct sessions array
  if (Array.isArray(data.sessions)) {
    return data.sessions.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  // Result itself might be an array (gateway returns array at top level)
  if (Array.isArray(data)) {
    return (data as unknown[]).filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  // Flat items/entries naming
  const items = data.items ?? data.entries ?? data.active;
  if (Array.isArray(items)) {
    return items.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }

  return [];
}

function parseSession(raw: Record<string, unknown>): GatewaySession {
  const id = String(raw.id ?? raw.sessionId ?? raw.session_id ?? "");
  const model = String(raw.model ?? raw.modelId ?? raw.model_id ?? "unknown");
  const type = String(
    raw.type ?? raw.sessionType ?? raw.session_type ?? "conversation"
  );
  const agent = String(raw.agent ?? raw.agentName ?? raw.agent_name ?? raw.user ?? raw.label ?? "");
  const started = String(
    raw.started ?? raw.startedAt ?? raw.started_at ?? raw.createdAt ?? raw.created_at ?? ""
  );
  const status = parseSessionStatus(raw.status);
  const tokensUsed = toNumber(
    raw.tokensUsed ?? raw.tokens_used ?? raw.totalTokens ?? raw.total_tokens,
    0
  );
  const maxContextWindow = toNumber(
    raw.maxContextWindow ?? raw.max_context_window ?? raw.contextWindow ?? raw.context_window,
    0
  );

  // Parse context usage
  const contextUsage = parseContextUsage(raw, maxContextWindow);

  return {
    id,
    model,
    type,
    contextUsage,
    agent,
    started,
    status,
    tokensUsed,
    maxContextWindow,
  };
}

function parseContextUsage(
  raw: Record<string, unknown>,
  maxContextWindow: number
): SessionContextUsage {
  // Check for nested contextUsage object
  const ctxRaw = raw.contextUsage ?? raw.context_usage ?? raw.context;
  if (ctxRaw && typeof ctxRaw === "object" && !Array.isArray(ctxRaw)) {
    const ctx = ctxRaw as Record<string, unknown>;
    const usedTokens = toNumber(
      ctx.usedTokens ?? ctx.used_tokens ?? ctx.used,
      0
    );
    const maxTokens = toNumber(
      ctx.maxTokens ?? ctx.max_tokens ?? ctx.max ?? maxContextWindow,
      maxContextWindow
    );
    const percent =
      typeof ctx.percent === "number"
        ? ctx.percent
        : maxTokens > 0
          ? Math.min(100, (usedTokens / maxTokens) * 100)
          : 0;

    return { usedTokens, maxTokens, percent };
  }

  // Fall back to top-level fields
  const usedTokens = toNumber(
    raw.contextTokens ?? raw.context_tokens ?? raw.tokensInContext ?? raw.tokens_in_context,
    0
  );
  const maxTokens = maxContextWindow || toNumber(
    raw.maxContextWindow ?? raw.max_context_window,
    0
  );
  const percent = maxTokens > 0
    ? Math.min(100, (usedTokens / maxTokens) * 100)
    : 0;

  return { usedTokens, maxTokens, percent };
}

function parseSessionStatus(
  raw: unknown
): "active" | "idle" | "completing" | "error" {
  if (typeof raw !== "string") return "active";
  const normalized = raw.toLowerCase();
  if (normalized === "idle" || normalized === "inactive") return "idle";
  if (normalized === "completing" || normalized === "finishing") return "completing";
  if (normalized === "error" || normalized === "failed") return "error";
  return "active";
}

function toNumber(val: unknown, fallback: number): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Format an ISO timestamp into a human-friendly relative time string.
 * Falls back to the raw string if parsing fails.
 */
function formatRelativeTime(isoString: string): string {
  if (!isoString) return "";

  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const now = Date.now();
    const diffMs = now - date.getTime();
    if (diffMs < 0) return "just now";

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return isoString;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSessionsList(
  options: UseSessionsListOptions
): UseSessionsListReturn {
  const {
    sendRequest,
    isAuthenticated,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
  } = options;

  const [sessionsData, setSessionsData] = useState<
    SessionsListData | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRequestRef = useRef(sendRequest);
  sendRequestRef.current = sendRequest;

  // ── Core fetch function ─────────────────────────────────────────────

  const fetchSessions = useCallback(async (): Promise<boolean> => {
    try {
      const response = await sendRequestRef.current(
        SESSIONS_METHOD,
        {},
        SESSIONS_REQUEST_TIMEOUT_MS
      );

      if (!mountedRef.current) return false;

      if (!response.ok) {
        const msg =
          response.error?.message ?? "Failed to fetch sessions data";
        setError(msg);
        return false;
      }

      if (!response.result) {
        setError("Empty sessions response from gateway");
        return false;
      }

      const parsed = parseSessionsResponse(response.result);
      setSessionsData(parsed);
      setLastUpdated(Date.now());
      setError(null);
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      const msg =
        err instanceof Error ? err.message : "Sessions fetch failed";
      setError(msg);
      return false;
    }
  }, []);

  // ── Polling lifecycle ───────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();

    // Mark as loading only if we have no data yet
    if (!sessionsData) {
      setIsLoading(true);
    }

    // Immediate first fetch
    fetchSessions().finally(() => {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    });

    // Schedule recurring fetches
    pollTimerRef.current = setInterval(() => {
      fetchSessions();
    }, pollIntervalMs);
  }, [fetchSessions, pollIntervalMs, stopPolling, sessionsData]);

  // Start/stop polling based on auth state and enabled flag
  useEffect(() => {
    mountedRef.current = true;

    if (isAuthenticated && enabled) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, enabled, pollIntervalMs]);

  // ── Manual refresh ──────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (isRefreshing || !isAuthenticated) return;
    setIsRefreshing(true);
    try {
      await fetchSessions();
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [fetchSessions, isRefreshing, isAuthenticated]);

  // ── Derived values ─────────────────────────────────────────────────

  const sessions = sessionsData?.sessions ?? [];
  const sessionCount = sessionsData?.count ?? 0;

  const activeSessions: ActiveSessionsData | undefined = sessionsData
    ? toLegacyActiveSessionsData(sessionsData)
    : undefined;

  // ── Return ──────────────────────────────────────────────────────────

  return {
    sessionsData,
    sessionCount,
    sessions,
    activeSessions,
    isLoading,
    isRefreshing,
    refresh,
    lastUpdated,
    error,
  };
}
