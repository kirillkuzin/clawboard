"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeRange = "7d" | "30d" | "all";

export interface ModelTokenUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenUsageAnalyticsData {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Per-model breakdown */
  models?: ModelTokenUsage[];
  /** Historical time-series for the chart */
  history?: { date: string; tokens: number }[];
}

export interface TokenUsageAnalyticsProps {
  data?: TokenUsageAnalyticsData;
  /** Callback to refresh data, optionally scoped to a time range */
  onRefresh?: (timeRange: TimeRange) => void;
  isRefreshing?: boolean;
}

// ---------------------------------------------------------------------------
// Time Range Toggle
// ---------------------------------------------------------------------------

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "all", label: "All" },
];

function TimeRangeToggle({
  value,
  onChange,
  disabled,
}: {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5">
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          disabled={disabled}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded transition-all duration-150",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            value === range.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function TokenSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-6 w-24 rounded bg-muted animate-pulse" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
            <div className="h-3 w-16 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      <div className="h-24 w-full rounded bg-muted/30 animate-pulse" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTooltipValue(value: number): string {
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Per-Model Token Table
// ---------------------------------------------------------------------------

function ModelTokenTable({ models }: { models: ModelTokenUsage[] }) {
  if (models.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No per-model data available
      </p>
    );
  }

  // Sort by total tokens descending
  const sorted = [...models].sort((a, b) => b.totalTokens - a.totalTokens);
  const maxTokens = sorted[0]?.totalTokens ?? 1;

  return (
    <div className="space-y-1.5 max-h-44 overflow-y-auto">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-[10px] text-muted-foreground font-medium pb-1 border-b border-border/50">
        <span>Model</span>
        <span className="text-right w-14">Prompt</span>
        <span className="text-right w-14">Compl.</span>
        <span className="text-right w-14">Total</span>
      </div>

      {sorted.map((model) => {
        const pct = maxTokens > 0 ? (model.totalTokens / maxTokens) * 100 : 0;
        return (
          <div key={model.model} className="space-y-0.5">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 items-center text-xs">
              <span className="font-medium truncate" title={model.model}>
                {model.model}
              </span>
              <span className="text-right w-14 text-muted-foreground tabular-nums text-[10px]">
                {formatTokenCount(model.promptTokens)}
              </span>
              <span className="text-right w-14 text-muted-foreground tabular-nums text-[10px]">
                {formatTokenCount(model.completionTokens)}
              </span>
              <span className="text-right w-14 font-semibold tabular-nums text-[10px]">
                {formatTokenCount(model.totalTokens)}
              </span>
            </div>
            {/* Usage bar */}
            <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500/60 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Bar Chart (history)
// ---------------------------------------------------------------------------

function TokenHistoryChart({
  history,
}: {
  history: { date: string; tokens: number }[];
}) {
  if (history.length === 0) {
    return (
      <div className="h-24 w-full rounded bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground">
        No history data
      </div>
    );
  }

  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={history} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatTokenCount(v)}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              color: "hsl(var(--popover-foreground))",
            }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => [typeof value === "number" ? formatTooltipValue(value) : String(value ?? ""), "Tokens"]}
          />
          <Bar
            dataKey="tokens"
            fill="hsl(var(--primary))"
            radius={[3, 3, 0, 0]}
            opacity={0.8}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TokenUsageAnalytics({
  data,
  onRefresh,
  isRefreshing = false,
}: TokenUsageAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");

  const handleTimeRangeChange = useCallback(
    (range: TimeRange) => {
      setTimeRange(range);
      onRefresh?.(range);
    },
    [onRefresh]
  );

  const handleRefresh = useCallback(() => {
    onRefresh?.(timeRange);
  }, [onRefresh, timeRange]);

  const fmt = (n?: number) =>
    n !== undefined ? n.toLocaleString() : "—";

  // Loading state
  if (!data) return <TokenSkeleton />;

  return (
    <div className="space-y-3">
      {/* Controls row: time range toggle + refresh */}
      <div className="flex items-center justify-between gap-2">
        <TimeRangeToggle
          value={timeRange}
          onChange={handleTimeRangeChange}
          disabled={isRefreshing}
        />
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-medium",
            "transition-all duration-200 hover:bg-muted",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          title="Refresh token usage"
        >
          <RefreshCw
            size={10}
            className={cn(isRefreshing && "animate-spin")}
          />
          Refresh
        </button>
      </div>

      {/* Aggregate totals */}
      <div className="flex items-baseline gap-3">
        <div>
          <p className="text-2xl font-bold tabular-nums">{fmt(data.totalTokens)}</p>
          <p className="text-xs text-muted-foreground">Total tokens</p>
        </div>
        <div className="ml-auto grid grid-cols-2 gap-3 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums">{fmt(data.promptTokens)}</p>
            <p className="text-[10px] text-muted-foreground">Prompt</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">{fmt(data.completionTokens)}</p>
            <p className="text-[10px] text-muted-foreground">Completion</p>
          </div>
        </div>
      </div>

      {/* Per-model breakdown */}
      {data.models && data.models.length > 0 && (
        <ModelTokenTable models={data.models} />
      )}

      {/* History chart */}
      {data.history && data.history.length > 0 && (
        <TokenHistoryChart history={data.history} />
      )}
    </div>
  );
}
