"use client";

/**
 * useUsageCostPolling – Dedicated JSON-RPC polling hook for usage.cost data.
 *
 * Fetches cost data from the OpenClaw gateway every 30 seconds via the
 * WebSocket JSON-RPC `metrics.cost` method. Supports manual refresh
 * triggering and returns parsed today/all-time/projected/per-model data.
 *
 * Usage:
 * ```tsx
 * const { costData, isLoading, isRefreshing, refresh, lastUpdated, error } =
 *   useUsageCostPolling({
 *     sendRequest,       // from useGatewayMonitor
 *     isAuthenticated,   // only poll when authed
 *     pollIntervalMs: 30_000,
 *   });
 * ```
 *
 * Response parsing:
 * The hook expects the gateway `metrics.cost` response to contain any subset
 * of: `today`, `allTime`, `projected`, `perModel`, `currency`. Missing fields
 * are normalized to safe defaults so consumers never need null-checks on shape.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { GatewayResponse } from "@/lib/gateway-types";

// ---------------------------------------------------------------------------
// Types – Enriched Cost Data
// ---------------------------------------------------------------------------

/** Per-model cost breakdown entry */
export interface CostModelBreakdown {
  /** Model identifier (e.g., "claude-sonnet-4-20250514", "gpt-4o") */
  model: string;
  /** Total cost for this model */
  cost: number;
  /** Number of requests to this model */
  requests?: number;
  /** Token count for this model */
  tokens?: number;
}

/** Daily cost snapshot */
export interface CostDailyEntry {
  /** Date string (ISO 8601 date, e.g., "2026-03-20") */
  date: string;
  /** Cost for that day */
  cost: number;
}

/** Parsed cost data with today/all-time/projected/per-model structure */
export interface UsageCostData {
  /** Today's total cost */
  today: number;
  /** All-time cumulative cost */
  allTime: number;
  /** Projected monthly cost based on current usage rate */
  projected: number;
  /** Currency code (default: "USD") */
  currency: string;
  /** Per-model cost breakdown */
  perModel: CostModelBreakdown[];
  /** Daily cost for the current billing period (for trend charts) */
  dailyHistory: CostDailyEntry[];
  /** Budget limit if configured, null otherwise */
  budgetLimit: number | null;
  /** Percentage of budget used (0-100), null if no budget */
  budgetUsedPercent: number | null;
}

/** Options for the useUsageCostPolling hook */
export interface UseUsageCostPollingOptions {
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

/** Return value of the useUsageCostPolling hook */
export interface UseUsageCostPollingReturn {
  /** Parsed cost data, or undefined if not yet fetched */
  costData: UsageCostData | undefined;
  /** Whether the initial fetch is in-flight (no data yet) */
  isLoading: boolean;
  /** Whether a manual refresh is in-flight */
  isRefreshing: boolean;
  /** Trigger a manual refresh of cost data */
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
const COST_METHOD = "metrics.cost";
const COST_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the raw gateway `metrics.cost` response into a typed UsageCostData.
 *
 * The gateway may return data in various shapes; this normalizer handles:
 * - Flat structure: `{ today, allTime, projected, currency, perModel, ... }`
 * - Nested structure: `{ cost: { today, allTime, ... } }`
 * - Legacy structure: `{ totalCost, dailyCost, breakdown }`
 *
 * All fields are optional and gracefully default.
 */
export function parseCostResponse(
  result: Record<string, unknown>
): UsageCostData {
  // Support both flat and nested response shapes
  const data =
    result.cost && typeof result.cost === "object"
      ? (result.cost as Record<string, unknown>)
      : result;

  // --- Scalar fields ---
  const today = toNumber(data.today ?? data.dailyCost ?? data.daily_cost, 0);
  const allTime = toNumber(
    data.allTime ?? data.all_time ?? data.totalCost ?? data.total_cost ?? data.total,
    0
  );
  const projected = toNumber(
    data.projected ?? data.projectedMonthly ?? data.projected_monthly,
    0
  );
  const currency = typeof data.currency === "string" ? data.currency : "USD";

  // --- Per-model breakdown ---
  const perModel = parsePerModel(
    data.perModel ?? data.per_model ?? data.breakdown ?? data.models
  );

  // --- Daily history ---
  const dailyHistory = parseDailyHistory(
    data.dailyHistory ?? data.daily_history ?? data.history ?? data.daily
  );

  // --- Budget ---
  const budgetLimit = toNumberOrNull(
    data.budgetLimit ?? data.budget_limit ?? data.budget
  );
  const budgetUsedPercent =
    budgetLimit !== null && budgetLimit > 0
      ? Math.min(100, (allTime / budgetLimit) * 100)
      : toNumberOrNull(data.budgetUsedPercent ?? data.budget_used_percent);

  return {
    today,
    allTime,
    projected,
    currency,
    perModel,
    dailyHistory,
    budgetLimit,
    budgetUsedPercent,
  };
}

/**
 * Convert the parsed UsageCostData back to the CostTrackingData shape
 * expected by the monitoring dashboard CostTrackingCard widget.
 *
 * Maps all enriched fields: per-model breakdown with token counts,
 * projected monthly cost, budget limit, and last-updated timestamp.
 */
export function toLegacyCostTrackingData(
  cost: UsageCostData
): {
  totalCost: number;
  dailyCost: number;
  projectedMonthlyCost: number;
  currency: string;
  breakdown: { label: string; amount: number }[];
  modelBreakdown: { model: string; cost: number; tokens?: number }[];
  budgetLimit?: number;
  lastUpdated: string;
} {
  return {
    totalCost: cost.allTime,
    dailyCost: cost.today,
    projectedMonthlyCost: cost.projected,
    currency: cost.currency,
    breakdown: cost.perModel.map((m) => ({
      label: m.model,
      amount: m.cost,
    })),
    modelBreakdown: cost.perModel.map((m) => ({
      model: m.model,
      cost: m.cost,
      tokens: m.tokens,
    })),
    ...(cost.budgetLimit !== null ? { budgetLimit: cost.budgetLimit } : {}),
    lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Parse helpers
// ---------------------------------------------------------------------------

function toNumber(val: unknown, fallback: number): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function toNumberOrNull(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}

function parsePerModel(raw: unknown): CostModelBreakdown[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    )
    .map((item) => ({
      model: String(item.model ?? item.label ?? item.name ?? "unknown"),
      cost: toNumber(item.cost ?? item.amount ?? item.total, 0),
      requests:
        typeof item.requests === "number" ? item.requests : undefined,
      tokens: typeof item.tokens === "number" ? item.tokens : undefined,
    }));
}

function parseDailyHistory(raw: unknown): CostDailyEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
    )
    .map((item) => ({
      date: String(item.date ?? item.day ?? ""),
      cost: toNumber(item.cost ?? item.amount ?? item.total, 0),
    }));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUsageCostPolling(
  options: UseUsageCostPollingOptions
): UseUsageCostPollingReturn {
  const {
    sendRequest,
    isAuthenticated,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
  } = options;

  const [costData, setCostData] = useState<UsageCostData | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRequestRef = useRef(sendRequest);
  sendRequestRef.current = sendRequest;

  // ── Core fetch function ─────────────────────────────────────────────

  const fetchCost = useCallback(async (): Promise<boolean> => {
    try {
      const response = await sendRequestRef.current(
        COST_METHOD,
        {},
        COST_REQUEST_TIMEOUT_MS
      );

      if (!mountedRef.current) return false;

      if (!response.ok) {
        const msg =
          response.error?.message ?? "Failed to fetch cost data";
        setError(msg);
        return false;
      }

      if (!response.result) {
        setError("Empty cost response from gateway");
        return false;
      }

      const parsed = parseCostResponse(response.result);
      setCostData(parsed);
      setLastUpdated(Date.now());
      setError(null);
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      const msg =
        err instanceof Error ? err.message : "Cost fetch failed";
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
    if (!costData) {
      setIsLoading(true);
    }

    // Immediate first fetch
    fetchCost().finally(() => {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    });

    // Schedule recurring fetches
    pollTimerRef.current = setInterval(() => {
      fetchCost();
    }, pollIntervalMs);
  }, [fetchCost, pollIntervalMs, stopPolling, costData]);

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
      await fetchCost();
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [fetchCost, isRefreshing, isAuthenticated]);

  // ── Return ──────────────────────────────────────────────────────────

  return {
    costData,
    isLoading,
    isRefreshing,
    refresh,
    lastUpdated,
    error,
  };
}
