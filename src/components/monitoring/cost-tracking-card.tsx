"use client";

import React, { useMemo } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { DollarSign, RefreshCw, AlertCircle, TrendingUp, TrendingDown, ShieldAlert } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { CostTrackingData } from "./monitoring-dashboard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CostTrackingCardProps {
  data?: CostTrackingData;
  /** Whether the card is in a loading state (initial load) */
  isLoading?: boolean;
  /** Error message to display instead of data */
  error?: string | null;
  /** Callback for the Refresh button */
  onRefresh?: () => void;
  /** Whether a refresh is in-flight */
  isRefreshing?: boolean;
  /** Additional className for the outer Card */
  className?: string;
  /** When true, overlays a "Waiting for admin approval" banner on the card content */
  showPairingOverlay?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number | undefined, currency = "USD"): string {
  if (amount === undefined || amount === null) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CostSkeleton() {
  return (
    <div className="space-y-4">
      {/* Top stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-6 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3 w-14 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      {/* Breakdown skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CostError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <AlertCircle size={20} className="text-destructive" />
      <p className="text-xs text-destructive font-medium">
        Failed to load cost data
      </p>
      <p className="text-[10px] text-muted-foreground max-w-[200px]">
        {message}
      </p>
    </div>
  );
}

function StatBlock({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | null;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <p className="text-lg font-bold tabular-nums truncate">{value}</p>
        {trend === "up" && (
          <TrendingUp size={12} className="text-red-500 shrink-0" />
        )}
        {trend === "down" && (
          <TrendingDown size={12} className="text-emerald-500 shrink-0" />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Breakdown Row
// ---------------------------------------------------------------------------

function ModelBreakdownRow({
  item,
  maxCost,
  currency,
}: {
  item: { model: string; cost: number; tokens?: number };
  maxCost: number;
  currency: string;
}) {
  const pct = maxCost > 0 ? (item.cost / maxCost) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate max-w-[60%]">
          {item.model}
        </span>
        <span className="font-medium tabular-nums shrink-0">
          {formatCurrency(item.cost, currency)}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-500/70 transition-all duration-500"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      {item.tokens !== undefined && (
        <p className="text-[10px] text-muted-foreground/60">
          {item.tokens.toLocaleString()} tokens
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model Cost Comparison Bar Chart
// ---------------------------------------------------------------------------

/** Color palette for per-model bars (cycles if more models than colors) */
const MODEL_BAR_COLORS = [
  "hsl(45, 93%, 47%)",   // amber-500
  "hsl(25, 95%, 53%)",   // orange-500
  "hsl(271, 91%, 65%)",  // violet-400
  "hsl(199, 89%, 48%)",  // sky-500
  "hsl(160, 84%, 39%)",  // emerald-500
  "hsl(346, 77%, 49%)",  // rose-500
  "hsl(221, 83%, 53%)",  // blue-500
  "hsl(47, 96%, 53%)",   // yellow-400
];

/** Truncate long model names for axis labels */
function truncateModel(name: string, maxLen = 16): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + "…";
}

interface ModelCostBarChartProps {
  modelBreakdown: { model: string; cost: number; tokens?: number }[];
  currency: string;
}

function ModelCostBarChart({ modelBreakdown, currency }: ModelCostBarChartProps) {
  const chartData = useMemo(
    () =>
      modelBreakdown.map((item) => ({
        model: item.model,
        label: truncateModel(item.model),
        cost: item.cost,
        tokens: item.tokens,
      })),
    [modelBreakdown]
  );

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }),
    [currency]
  );

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Model Cost Comparison
      </p>
      <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 32 + 40)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            className="stroke-border/40"
          />
          <XAxis
            type="number"
            tickFormatter={(v: number) => currencyFormatter.format(v)}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              borderColor: "hsl(var(--border))",
              borderRadius: 8,
              fontSize: 11,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            formatter={(value: unknown, _name: unknown, entry: unknown) => {
              const numVal = typeof value === "number" ? value : 0;
              const formatted = currencyFormatter.format(numVal);
              const e = entry as { payload?: { tokens?: number } } | undefined;
              const tokens = e?.payload?.tokens;
              return tokens !== undefined
                ? `${formatted} (${tokens.toLocaleString()} tokens)`
                : formatted;
            }}
            labelFormatter={(label: unknown) => {
              const labelStr = String(label ?? "");
              const match = chartData.find((d) => d.label === labelStr);
              return match?.model ?? labelStr;
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
          />
          <Bar
            dataKey="cost"
            name={`Cost (${currency})`}
            radius={[0, 4, 4, 0]}
            maxBarSize={24}
          >
            {chartData.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={MODEL_BAR_COLORS[index % MODEL_BAR_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function CostTrackingCard({
  data,
  isLoading = false,
  error = null,
  onRefresh,
  isRefreshing = false,
  className,
  showPairingOverlay = false,
}: CostTrackingCardProps) {
  const currency = data?.currency ?? "USD";

  // Determine the max model cost for proportional bar widths
  const maxModelCost =
    data?.modelBreakdown?.reduce((max, m) => Math.max(max, m.cost), 0) ?? 0;

  // Determine projected trend direction relative to current spending
  const projectedTrend: "up" | "down" | null = (() => {
    if (!data?.projectedMonthlyCost || !data?.totalCost) return null;
    return data.projectedMonthlyCost > data.totalCost ? "up" : "down";
  })();

  return (
    <Card
      className={cn(
        "transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <DollarSign size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm">Cost Tracking</CardTitle>
            <CardDescription className="text-xs truncate">
              Spend &amp; budget metrics
            </CardDescription>
          </div>
          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing || isLoading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-medium",
              "transition-all duration-200 hover:bg-muted",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            title="Refresh cost data"
          >
            <RefreshCw
              size={10}
              className={cn(isRefreshing && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </CardHeader>

      <CardContent className="relative">
        {showPairingOverlay && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 backdrop-blur-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <ShieldAlert size={20} className="text-blue-500 animate-pulse" />
            </div>
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Waiting for admin approval
            </p>
            <p className="text-xs text-muted-foreground max-w-[200px] text-center">
              An operator must approve this device before data is available
            </p>
          </div>
        )}
        {/* Error state */}
        {error ? (
          <CostError message={error} />
        ) : /* Loading state */
        isLoading || !data ? (
          <CostSkeleton />
        ) : (
          /* Data state */
          <div className="space-y-4">
            {/* Top stats: Today / All-time / Projected */}
            <div className="grid grid-cols-3 gap-3">
              <StatBlock
                label="Today"
                value={formatCurrency(data.dailyCost, currency)}
              />
              <StatBlock
                label="All-time"
                value={formatCurrency(data.totalCost, currency)}
              />
              <StatBlock
                label="Projected / mo"
                value={formatCurrency(data.projectedMonthlyCost, currency)}
                trend={projectedTrend}
              />
            </div>

            {/* Budget limit indicator */}
            {data.budgetLimit !== undefined && data.totalCost !== undefined && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Budget usage</span>
                  <span className="font-medium tabular-nums">
                    {formatCurrency(data.totalCost, currency)} / {formatCurrency(data.budgetLimit, currency)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      (data.totalCost / data.budgetLimit) > 0.9
                        ? "bg-red-500"
                        : (data.totalCost / data.budgetLimit) > 0.7
                        ? "bg-yellow-500"
                        : "bg-emerald-500"
                    )}
                    style={{
                      width: `${Math.min((data.totalCost / data.budgetLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* General breakdown (label/amount pairs) */}
            {data.breakdown && data.breakdown.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Breakdown
                </p>
                {data.breakdown.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(item.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Per-model cost comparison bar chart */}
            {data.modelBreakdown && data.modelBreakdown.length > 0 && (
              <ModelCostBarChart
                modelBreakdown={data.modelBreakdown}
                currency={currency}
              />
            )}

            {/* Last updated */}
            {data.lastUpdated && (
              <p className="text-[10px] text-muted-foreground/50 text-right">
                Updated {formatRelativeTime(data.lastUpdated)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
