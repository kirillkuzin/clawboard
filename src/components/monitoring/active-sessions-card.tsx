"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { ActiveSessionsData, SessionEntry, SessionType } from "./monitoring-dashboard";

// ---------------------------------------------------------------------------
// Session type badge configuration
// ---------------------------------------------------------------------------

const SESSION_TYPE_CONFIG: Record<
  SessionType,
  { label: string; color: string }
> = {
  dm: {
    label: "DM",
    color:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  group: {
    label: "Group",
    color:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  cron: {
    label: "Cron",
    color:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  subagent: {
    label: "Sub-Agent",
    color:
      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  },
};

// ---------------------------------------------------------------------------
// Session Type Badge
// ---------------------------------------------------------------------------

function SessionTypeBadge({ type }: { type: SessionType }) {
  const config = SESSION_TYPE_CONFIG[type];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap",
        config.color
      )}
    >
      {config.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Context Usage Bar
// ---------------------------------------------------------------------------

function ContextUsageBar({
  percent,
  used,
  total,
}: {
  percent: number;
  used?: number;
  total?: number;
}) {
  const level =
    percent >= 90 ? "high" : percent >= 70 ? "medium" : "low";

  const barColor = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-red-500",
  }[level];

  const textColor = {
    low: "text-emerald-600 dark:text-emerald-400",
    medium: "text-amber-600 dark:text-amber-400",
    high: "text-red-600 dark:text-red-400",
  }[level];

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return `${n}`;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">Context</span>
        <span className={cn("text-[10px] font-medium tabular-nums", textColor)}>
          {used !== undefined && total !== undefined
            ? `${formatTokens(used)} / ${formatTokens(total)}`
            : `${Math.round(percent)}%`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            barColor
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Row
// ---------------------------------------------------------------------------

function SessionRow({ session }: { session: SessionEntry }) {
  return (
    <div className="rounded-lg border border-border/50 px-3 py-2.5 space-y-2 transition-colors hover:border-border">
      {/* Top row: model + badge + time */}
      <div className="flex items-center gap-2">
        {/* Model name or agent fallback */}
        <span className="text-xs font-medium truncate min-w-0 flex-1">
          {session.model || session.agent}
        </span>
        {session.type && <SessionTypeBadge type={session.type} />}
        <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
          {session.started}
        </span>
      </div>

      {/* Agent name below model if model is present */}
      {session.model && session.agent && session.model !== session.agent && (
        <p className="text-[10px] text-muted-foreground truncate -mt-1">
          {session.agent}
        </p>
      )}

      {/* Context usage bar */}
      {session.contextPercent !== undefined && (
        <ContextUsageBar
          percent={session.contextPercent}
          used={session.contextUsed}
          total={session.contextTotal}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ActiveSessionsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <div className="h-7 w-8 rounded bg-muted animate-pulse" />
        <div className="h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border/50 px-3 py-2.5 space-y-2"
        >
          <div className="flex items-center gap-2">
            <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
            <div className="h-4 w-12 rounded-full bg-muted animate-pulse" />
            <div className="h-2.5 w-14 rounded bg-muted animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="h-2 w-10 rounded bg-muted animate-pulse" />
              <div className="h-2 w-16 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active Sessions Card (inner content)
// ---------------------------------------------------------------------------

export interface ActiveSessionsCardProps {
  data?: ActiveSessionsData;
}

export function ActiveSessionsCard({ data }: ActiveSessionsCardProps) {
  if (!data) return <ActiveSessionsSkeleton />;

  const sessionCount = data.count ?? data.sessions?.length ?? 0;
  const sessions = data.sessions ?? [];

  return (
    <div className="space-y-3">
      {/* Summary count */}
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums">{sessionCount}</p>
        <p className="text-xs text-muted-foreground">
          active session{sessionCount !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Session list */}
      {sessions.length > 0 ? (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No active sessions
        </p>
      )}

      {/* Type legend (only show if there are sessions with types) */}
      {sessions.some((s) => s.type) && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
          {(Object.entries(SESSION_TYPE_CONFIG) as [SessionType, { label: string; color: string }][])
            .filter(([type]) => sessions.some((s) => s.type === type))
            .map(([type, config]) => (
              <span
                key={type}
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none opacity-60",
                  config.color
                )}
              >
                {config.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
