"use client";

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ChartsTrendsData } from "./monitoring-dashboard";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChartsTrendsCardProps {
  data?: ChartsTrendsData;
  /** Additional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Color palette for series lines/areas
// ---------------------------------------------------------------------------

const SERIES_COLORS = [
  { stroke: "#06b6d4", fill: "#06b6d4" }, // cyan-500
  { stroke: "#8b5cf6", fill: "#8b5cf6" }, // violet-500
  { stroke: "#f59e0b", fill: "#f59e0b" }, // amber-500
  { stroke: "#10b981", fill: "#10b981" }, // emerald-500
  { stroke: "#ef4444", fill: "#ef4444" }, // red-500
  { stroke: "#3b82f6", fill: "#3b82f6" }, // blue-500
];

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/** Format cost values for Y axis ticks — compact ($0, $1.50, $2K) */
function formatCostAxis(value: number): string {
  if (value === 0) return "$0";
  if (value >= 10_000) return `$${(value / 1_000).toFixed(0)}K`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 100) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(3)}`;
}

/** Format cost values for tooltip — full precision */
function formatCostTooltip(value: number): string {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

/** Format X axis date labels — shorten ISO dates to "Mon DD" */
function formatDateTick(dateStr: string): string {
  // Already short? Return as-is
  if (dateStr.length <= 7) return dateStr;
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
  } catch {
    // fall through
  }
  return dateStr;
}

// ---------------------------------------------------------------------------
// Skeleton loader matching WidgetSkeleton pattern
// ---------------------------------------------------------------------------

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      {/* Fake axis + bars */}
      <div className="flex items-end gap-1.5 h-48 px-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-muted animate-pulse"
            style={{
              height: `${20 + Math.sin(i * 0.8) * 30 + Math.random() * 20}%`,
              animationDelay: `${i * 75}ms`,
            }}
          />
        ))}
      </div>
      {/* Fake x-axis labels */}
      <div className="flex justify-between px-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-2 w-10 rounded bg-muted animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Tooltip — cost-formatted
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function CostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-popover-foreground mb-1">
        {label ? formatDateTick(String(label)) : ""}
      </p>
      <div className="space-y-0.5">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-medium tabular-nums text-popover-foreground">
              {typeof entry.value === "number"
                ? formatCostTooltip(entry.value)
                : String(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex h-48 items-center justify-center text-xs text-muted-foreground italic">
      No trend data available
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ChartsTrendsCard
// ---------------------------------------------------------------------------

export function ChartsTrendsCard({ data, className }: ChartsTrendsCardProps) {
  // Transform series data into recharts-compatible format
  // Each data point becomes { x: "label", series1: value, series2: value, ... }
  const { chartData, seriesNames } = useMemo(() => {
    if (!data?.series || data.series.length === 0) {
      return { chartData: [], seriesNames: [] };
    }

    const names = data.series.map((s) => s.name);

    // Build a map of x → { x, [seriesName]: y }
    const pointMap = new Map<string, Record<string, string | number>>();

    for (const series of data.series) {
      for (const point of series.data) {
        if (!pointMap.has(point.x)) {
          pointMap.set(point.x, { x: point.x });
        }
        pointMap.get(point.x)![series.name] = point.y;
      }
    }

    // Sort by x value (assuming ISO dates or sortable strings)
    const sorted = Array.from(pointMap.values()).sort((a, b) =>
      String(a.x).localeCompare(String(b.x))
    );

    return { chartData: sorted, seriesNames: names };
  }, [data]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!data) {
    return <ChartSkeleton />;
  }

  if (chartData.length === 0) {
    return <EmptyState />;
  }

  const showLegend = seriesNames.length > 1;

  return (
    <div className={cn("w-full", className)}>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              {seriesNames.map((name, i) => {
                const color = SERIES_COLORS[i % SERIES_COLORS.length];
                return (
                  <linearGradient
                    key={name}
                    id={`costTrendGradient-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={color.fill}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={color.fill}
                      stopOpacity={0.05}
                    />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-border"
              vertical={false}
            />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              tickFormatter={formatDateTick}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              className="text-muted-foreground"
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={formatCostAxis}
            />
            <Tooltip
              content={<CostTooltip />}
              cursor={{
                stroke: "hsl(var(--muted-foreground))",
                strokeWidth: 1,
                strokeDasharray: "4 4",
              }}
            />
            {showLegend && (
              <Legend
                verticalAlign="top"
                height={24}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
              />
            )}
            {seriesNames.map((name, i) => {
              const color = SERIES_COLORS[i % SERIES_COLORS.length];
              return (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={color.stroke}
                  strokeWidth={2}
                  fill={`url(#costTrendGradient-${i})`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    strokeWidth: 2,
                    stroke: color.stroke,
                    fill: "var(--background)",
                  }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
