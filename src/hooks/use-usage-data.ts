"use client";

/**
 * useUsageData – Data-fetching hook for token usage analytics.
 *
 * Polls `usage.status` via the existing WebSocket JSON-RPC connection every 30s,
 * supports manual refresh trigger, and parses per-model token counts with
 * time-range filtering (7d / 30d / all-time).
 *
 * This hook is designed to be used alongside useGatewayMonitor — it takes the
 * gateway's `sendRequest` function and connection status as inputs rather than
 * managing its own WebSocket connection.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { GatewayResponse } from "@/lib/gateway-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Time range options for filtering usage data */
export type UsageTimeRange = "7d" | "30d" | "all";

/** Per-model token breakdown */
export interface ModelTokenUsage {
  /** Model identifier (e.g. "gpt-4o", "claude-3-opus") */
  model: string;
  /** Total tokens consumed by this model */
  totalTokens: number;
  /** Prompt/input tokens */
  promptTokens: number;
  /** Completion/output tokens */
  completionTokens: number;
  /** Number of requests */
  requestCount: number;
  /** Cost attributed to this model (optional) */
  cost?: number;
}

/** A single time-series data point for usage history */
export interface UsageHistoryPoint {
  /** Date string (ISO 8601 date or datetime) */
  date: string;
  /** Total tokens for this period */
  tokens: number;
  /** Prompt tokens for this period */
  promptTokens?: number;
  /** Completion tokens for this period */
  completionTokens?: number;
  /** Number of requests in this period */
  requestCount?: number;
}

/** Raw usage.status response payload from the gateway */
export interface UsageStatusResponse {
  /** Aggregate totals */
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalRequests?: number;
  /** Per-model breakdown */
  models?: ModelTokenUsage[];
  /** Time-series history */
  history?: UsageHistoryPoint[];
  /** Cost summary */
  totalCost?: number;
  currency?: string;
  /** Server-side time range that was applied */
  timeRange?: string;
  /** Timestamp of when data was generated */
  generatedAt?: string;
}

/** Parsed and processed usage data exposed to consumers */
export interface UsageData {
  /** Currently selected time range */
  timeRange: UsageTimeRange;

  /** Aggregate token totals */
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalRequests: number;

  /** Per-model breakdown, sorted by totalTokens descending */
  models: ModelTokenUsage[];
  /** Top model by usage */
  topModel: ModelTokenUsage | null;

  /** Time-series history for chart rendering */
  history: UsageHistoryPoint[];

  /** Cost summary */
  totalCost: number | null;
  currency: string;

  /** Last fetch timestamp */
  lastUpdatedAt: number | null;
  /** Server-generated timestamp */
  generatedAt: string | null;
}

/** Options for useUsageData */
export interface UseUsageDataOptions {
  /**
   * Function to send a JSON-RPC request over the gateway WS.
   * Typically `sendRequest` from useGatewayMonitor.
   */
  sendRequest: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<GatewayResponse>;

  /** Whether the gateway connection is authenticated and ready */
  isConnected: boolean;

  /** Polling interval in milliseconds (default: 30000) */
  pollIntervalMs?: number;

  /** Whether to auto-start polling on connect (default: true) */
  autoStart?: boolean;

  /** Initial time range (default: "7d") */
  initialTimeRange?: UsageTimeRange;
}

/** Return type of useUsageData */
export interface UseUsageDataReturn {
  /** Parsed usage data (null before first successful fetch) */
  data: UsageData | null;

  /** Whether a fetch is currently in-flight */
  isLoading: boolean;

  /** Whether a manual refresh is in-flight */
  isRefreshing: boolean;

  /** Error from the last fetch attempt (null if successful) */
  error: string | null;

  /** Current time range filter */
  timeRange: UsageTimeRange;

  /** Change the time range filter (triggers immediate re-fetch) */
  setTimeRange: (range: UsageTimeRange) => void;

  /** Manually trigger a refresh */
  refresh: () => Promise<void>;

  /** Number of successful fetches since mount */
  fetchCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const USAGE_STATUS_METHOD = "usage.status";
const USAGE_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the raw gateway response into structured UsageData */
function parseUsageResponse(
  raw: Record<string, unknown>,
  timeRange: UsageTimeRange
): UsageData {
  const r = raw as unknown as UsageStatusResponse;

  // Parse per-model breakdown
  const models: ModelTokenUsage[] = Array.isArray(r.models)
    ? r.models
        .map((m): ModelTokenUsage => ({
          model: String(m.model ?? "unknown"),
          totalTokens: Number(m.totalTokens ?? 0),
          promptTokens: Number(m.promptTokens ?? 0),
          completionTokens: Number(m.completionTokens ?? 0),
          requestCount: Number(m.requestCount ?? 0),
          cost: m.cost != null ? Number(m.cost) : undefined,
        }))
        // Sort by totalTokens descending
        .sort((a, b) => b.totalTokens - a.totalTokens)
    : [];

  // Parse time-series history
  const history: UsageHistoryPoint[] = Array.isArray(r.history)
    ? r.history.map(
        (h): UsageHistoryPoint => ({
          date: String(h.date ?? ""),
          tokens: Number(h.tokens ?? 0),
          promptTokens: h.promptTokens != null ? Number(h.promptTokens) : undefined,
          completionTokens:
            h.completionTokens != null ? Number(h.completionTokens) : undefined,
          requestCount:
            h.requestCount != null ? Number(h.requestCount) : undefined,
        })
      )
    : [];

  // Apply client-side time-range filtering on history if server didn't pre-filter
  const filteredHistory = filterHistoryByRange(history, timeRange);

  // Compute aggregates from models if top-level totals are missing
  const totalTokens =
    r.totalTokens ??
    models.reduce((sum, m) => sum + m.totalTokens, 0);
  const promptTokens =
    r.promptTokens ??
    models.reduce((sum, m) => sum + m.promptTokens, 0);
  const completionTokens =
    r.completionTokens ??
    models.reduce((sum, m) => sum + m.completionTokens, 0);
  const totalRequests =
    r.totalRequests ??
    models.reduce((sum, m) => sum + m.requestCount, 0);

  return {
    timeRange,
    totalTokens,
    promptTokens,
    completionTokens,
    totalRequests,
    models,
    topModel: models.length > 0 ? models[0] : null,
    history: filteredHistory,
    totalCost: r.totalCost != null ? Number(r.totalCost) : null,
    currency: r.currency ?? "USD",
    lastUpdatedAt: Date.now(),
    generatedAt: r.generatedAt ? String(r.generatedAt) : null,
  };
}

/** Filter history points to only include data within the selected time range */
function filterHistoryByRange(
  history: UsageHistoryPoint[],
  range: UsageTimeRange
): UsageHistoryPoint[] {
  if (range === "all" || history.length === 0) return history;

  const now = Date.now();
  const daysMap: Record<Exclude<UsageTimeRange, "all">, number> = {
    "7d": 7,
    "30d": 30,
  };
  const cutoffMs = now - daysMap[range] * 24 * 60 * 60 * 1000;

  return history.filter((point) => {
    const pointTime = new Date(point.date).getTime();
    // If date parsing fails, include the point to be safe
    return isNaN(pointTime) || pointTime >= cutoffMs;
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUsageData(options: UseUsageDataOptions): UseUsageDataReturn {
  const {
    sendRequest,
    isConnected,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    autoStart = true,
    initialTimeRange = "7d",
  } = options;

  // ── State ──────────────────────────────────────────────────────────────
  const [data, setData] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRangeState] = useState<UsageTimeRange>(initialTimeRange);
  const [fetchCount, setFetchCount] = useState(0);

  // ── Refs ────────────────────────────────────────────────────────────────
  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRequestRef = useRef(sendRequest);
  sendRequestRef.current = sendRequest;
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;

  // ── Core fetch function ────────────────────────────────────────────────

  const fetchUsageData = useCallback(
    async (range?: UsageTimeRange): Promise<boolean> => {
      const currentRange = range ?? timeRangeRef.current;

      try {
        const response = await sendRequestRef.current(
          USAGE_STATUS_METHOD,
          { timeRange: currentRange },
          USAGE_REQUEST_TIMEOUT_MS
        );

        if (!mountedRef.current) return false;

        if (!response.ok) {
          const errMsg =
            response.error?.message ??
            `usage.status failed (${response.error?.code ?? "unknown"})`;
          setError(errMsg);
          return false;
        }

        if (response.result) {
          const parsed = parseUsageResponse(response.result, currentRange);
          setData(parsed);
          setError(null);
          setFetchCount((c) => c + 1);
          return true;
        }

        return false;
      } catch (err) {
        if (!mountedRef.current) return false;
        const message =
          err instanceof Error ? err.message : "Failed to fetch usage data";
        setError(message);
        return false;
      }
    },
    []
  );

  // ── Polling management ─────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();

    // Immediate first fetch
    setIsLoading(true);
    fetchUsageData().finally(() => {
      if (mountedRef.current) setIsLoading(false);
    });

    // Set up interval
    pollTimerRef.current = setInterval(() => {
      fetchUsageData();
    }, pollIntervalMs);
  }, [fetchUsageData, pollIntervalMs, stopPolling]);

  // ── Manual refresh ─────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchUsageData();
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [fetchUsageData, isRefreshing]);

  // ── Time range change ──────────────────────────────────────────────────

  const setTimeRange = useCallback(
    (range: UsageTimeRange) => {
      setTimeRangeState(range);
      timeRangeRef.current = range;

      // If we have existing data, re-filter history immediately for instant UI update
      setData((prev) => {
        if (!prev) return prev;
        // Re-parse with new range if we have raw history
        return { ...prev, timeRange: range, history: filterHistoryByRange(prev.history, range) };
      });

      // Then fetch fresh data with the new range from the server
      if (isConnected) {
        setIsLoading(true);
        fetchUsageData(range).finally(() => {
          if (mountedRef.current) setIsLoading(false);
        });
      }
    },
    [isConnected, fetchUsageData]
  );

  // ── Auto-start/stop polling based on connection state ──────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (isConnected && autoStart) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [isConnected, autoStart, startPolling, stopPolling]);

  // ── Return ──────────────────────────────────────────────────────────────

  return useMemo(
    () => ({
      data,
      isLoading,
      isRefreshing,
      error,
      timeRange,
      setTimeRange,
      refresh,
      fetchCount,
    }),
    [data, isLoading, isRefreshing, error, timeRange, setTimeRange, refresh, fetchCount]
  );
}
