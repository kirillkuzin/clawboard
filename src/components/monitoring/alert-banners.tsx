"use client";

import React, { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  X,
} from "lucide-react";
import type { AlertData } from "./monitoring-dashboard";

// ---------------------------------------------------------------------------
// Alert severity configuration
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    border: "border-red-500/30",
    bg: "bg-red-500/5",
    text: "text-red-600 dark:text-red-400",
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
    dismissHover: "hover:bg-red-500/20",
    label: "Critical",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-yellow-500/30",
    bg: "bg-yellow-500/5",
    text: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    dismissHover: "hover:bg-yellow-500/20",
    label: "Warning",
  },
  info: {
    icon: Info,
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    text: "text-blue-600 dark:text-blue-400",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    dismissHover: "hover:bg-blue-500/20",
    label: "Info",
  },
} as const;

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function AlertBannersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2.5"
        >
          <div className="h-4 w-4 rounded bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1">
            <div
              className={cn(
                "h-2.5 rounded bg-muted animate-pulse",
                i === 0 ? "w-3/4" : i === 1 ? "w-full" : "w-1/2"
              )}
            />
          </div>
          <div className="h-4 w-10 rounded bg-muted animate-pulse shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timestamp formatter
// ---------------------------------------------------------------------------

function formatAlertTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60_000);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// AlertBanners Component
// ---------------------------------------------------------------------------

export interface AlertBannersProps {
  /** Alert data from the gateway — undefined means still loading */
  data?: AlertData[];
  /** Called when user dismisses an alert (optional — if not provided, dismiss is local-only) */
  onDismiss?: (alertId: string) => void;
}

export function AlertBanners({ data, onDismiss }: AlertBannersProps) {
  // Track locally dismissed alerts (persists during session)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handleDismiss = useCallback(
    (alertId: string) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(alertId);
        return next;
      });
      onDismiss?.(alertId);
    },
    [onDismiss]
  );

  // Loading state
  if (!data) return <AlertBannersSkeleton />;

  // Filter out dismissed alerts
  const visibleAlerts = data.filter((alert) => !dismissed.has(alert.id));

  // Empty state
  if (visibleAlerts.length === 0) {
    return (
      <div className="flex items-center justify-center py-4 gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
          <Info size={14} className="text-emerald-500" />
        </div>
        <p className="text-xs text-muted-foreground italic">
          No active alerts — all systems nominal
        </p>
      </div>
    );
  }

  // Sort: critical first, then warning, then info
  const sortedAlerts = [...visibleAlerts].sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
      {sortedAlerts.map((alert) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              "group flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs transition-all duration-200",
              config.border,
              config.bg,
              config.text
            )}
          >
            {/* Severity icon */}
            <Icon size={14} className="mt-0.5 shrink-0" />

            {/* Alert content */}
            <div className="flex-1 min-w-0">
              <p className="break-words leading-relaxed">{alert.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    config.badge
                  )}
                >
                  {config.label}
                </span>
                {alert.timestamp && (
                  <span className="text-[10px] opacity-60">
                    {formatAlertTime(alert.timestamp)}
                  </span>
                )}
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => handleDismiss(alert.id)}
              className={cn(
                "shrink-0 rounded p-1 opacity-0 transition-all duration-200",
                "group-hover:opacity-100 focus:opacity-100",
                "hover:bg-current/10 focus:outline-none focus:ring-1 focus:ring-current/20",
                config.dismissHover
              )}
              aria-label={`Dismiss alert: ${alert.message}`}
              title="Dismiss alert"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {/* Dismissed count hint */}
      {dismissed.size > 0 && (
        <p className="text-[10px] text-muted-foreground text-center pt-1">
          {dismissed.size} alert{dismissed.size !== 1 ? "s" : ""} dismissed
        </p>
      )}
    </div>
  );
}
