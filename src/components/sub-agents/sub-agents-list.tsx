"use client";

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSubAgents } from "@/hooks/use-sub-agents";
import { Badge } from "@/components/ui/badge";
import type { SubAgent, SubAgentStatus } from "@/lib/types";
import { SubAgentDetail } from "./sub-agent-detail";
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Bot,
  MessageSquare,
  AlertCircle,
  Loader2,
  X,
  Activity,
  Pause,
  CheckCircle2,
  XCircle,
  Timer,
  StopCircle,
} from "lucide-react";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<
  SubAgentStatus,
  {
    label: string;
    variant: "success" | "default" | "destructive" | "secondary" | "warning" | "outline";
    dotColor: string;
    icon: React.ElementType;
  }
> = {
  running: { label: "Running", variant: "success", dotColor: "bg-emerald-400", icon: Activity },
  idle: { label: "Idle", variant: "secondary", dotColor: "bg-zinc-400", icon: Pause },
  completed: { label: "Completed", variant: "default", dotColor: "bg-blue-400", icon: CheckCircle2 },
  error: { label: "Error", variant: "destructive", dotColor: "bg-red-400", icon: XCircle },
  waiting: { label: "Waiting", variant: "warning", dotColor: "bg-amber-400", icon: Timer },
  stopped: { label: "Stopped", variant: "outline", dotColor: "bg-zinc-500", icon: StopCircle },
};

function StatusBadge({ status }: { status: SubAgentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  return (
    <Badge variant={config.variant} className="gap-1.5 text-[11px]">
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
      {config.label}
    </Badge>
  );
}

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "—";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

function formatDuration(start: string | undefined, end: string | undefined): string {
  if (!start) return "—";
  try {
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const totalSec = Math.floor(diffMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return `${min}m ${sec}s`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  } catch {
    return "—";
  }
}

/* ─── Desktop Table Row ─── */

function AgentTableRow({ agent, onSelect }: { agent: SubAgent; onSelect: (id: string) => void }) {
  const config = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const StatusIcon = config.icon;

  return (
    <tr
      className="group border-b border-border/40 hover:bg-muted/30 transition-colors duration-150 cursor-pointer"
      onClick={() => onSelect(agent.id)}
    >
      {/* Name + Type */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-primary/5 text-primary/60 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
            <Bot size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {agent.name || `Agent ${agent.id.slice(0, 8)}`}
            </div>
            {agent.agent_type && (
              <div className="text-[11px] text-muted-foreground truncate">
                {agent.agent_type}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <StatusIcon
            size={13}
            className={cn(
              agent.status === "running" && "text-emerald-500 animate-pulse",
              agent.status === "error" && "text-red-500",
              agent.status === "waiting" && "text-amber-500",
              agent.status === "completed" && "text-blue-500",
              (agent.status === "idle" || agent.status === "stopped") && "text-muted-foreground"
            )}
          />
          <StatusBadge status={agent.status} />
        </div>
      </td>

      {/* Parent Conversation */}
      <td className="px-4 py-3">
        {agent.parent_conversation_id ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <MessageSquare size={12} className="shrink-0 text-muted-foreground/60" />
            <span className="truncate max-w-[180px]" title={agent.parent_conversation_id}>
              {agent.parent_conversation_title || agent.parent_conversation_id.slice(0, 12) + "…"}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </td>

      {/* Current Task */}
      <td className="px-4 py-3">
        {agent.current_task ? (
          <span className="text-xs text-muted-foreground truncate block max-w-[200px]" title={agent.current_task}>
            {agent.current_task}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </td>

      {/* Duration */}
      <td className="px-4 py-3 text-right">
        <span className="text-xs text-muted-foreground font-mono">
          {formatDuration(agent.started_at, agent.completed_at)}
        </span>
      </td>

      {/* Updated */}
      <td className="px-4 py-3 text-right">
        <div
          className="flex items-center gap-1 justify-end text-xs text-muted-foreground"
          title={formatDateTime(agent.updated_at || agent.started_at)}
        >
          <Clock size={12} className="shrink-0" />
          {formatRelativeTime(agent.updated_at || agent.started_at)}
        </div>
      </td>
    </tr>
  );
}

/* ─── Mobile Card ─── */

function AgentCard({ agent, onSelect }: { agent: SubAgent; onSelect: (id: string) => void }) {
  const config = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.idle;
  const StatusIcon = config.icon;

  return (
    <div
      className="border-b border-border/40 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => onSelect(agent.id)}
    >
      {/* Top row: name + status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-primary/5 text-primary/60">
            <Bot size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground truncate">
              {agent.name || `Agent ${agent.id.slice(0, 8)}`}
            </div>
            {agent.agent_type && (
              <div className="text-[11px] text-muted-foreground">{agent.agent_type}</div>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <StatusIcon
            size={13}
            className={cn(
              agent.status === "running" && "text-emerald-500 animate-pulse",
              agent.status === "error" && "text-red-500",
              agent.status === "waiting" && "text-amber-500"
            )}
          />
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground ml-10">
        {agent.parent_conversation_id && (
          <div className="flex items-center gap-1 col-span-2">
            <MessageSquare size={11} className="shrink-0" />
            <span className="truncate">
              {agent.parent_conversation_title || agent.parent_conversation_id.slice(0, 16)}
            </span>
          </div>
        )}
        {agent.current_task && (
          <div className="col-span-2 truncate text-muted-foreground/80">
            Task: {agent.current_task}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Clock size={11} className="shrink-0" />
          {formatRelativeTime(agent.updated_at || agent.started_at)}
        </div>
        <div className="text-right font-mono">
          {formatDuration(agent.started_at, agent.completed_at)}
        </div>
      </div>

      {/* Error message */}
      {agent.status === "error" && agent.error_message && (
        <div className="mt-2 ml-10 px-2 py-1.5 rounded-md bg-destructive/10 text-[11px] text-destructive truncate">
          {agent.error_message}
        </div>
      )}
    </div>
  );
}

/* ─── State Screens ─── */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Bot size={24} className="text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        {hasFilters ? "No matching sub-agents" : "No sub-agents yet"}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        {hasFilters
          ? "Try adjusting your search or filters to find what you're looking for."
          : "Sub-agents will appear here once the OpenClaw instance spawns them."}
      </p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <AlertCircle size={24} className="text-destructive" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Failed to load sub-agents
      </h3>
      <p className="text-xs text-muted-foreground max-w-[300px] mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 size={24} className="text-primary animate-spin mb-3" />
      <p className="text-xs text-muted-foreground">Loading sub-agents...</p>
    </div>
  );
}

/* ─── Summary Cards ─── */

function SummaryCards({ agents }: { agents: SubAgent[] }) {
  const counts = useMemo(() => {
    const c = { running: 0, idle: 0, completed: 0, error: 0, waiting: 0, stopped: 0 };
    agents.forEach((a) => {
      if (a.status in c) c[a.status as keyof typeof c]++;
    });
    return c;
  }, [agents]);

  const cards = [
    { label: "Running", value: counts.running, color: "text-emerald-500", bg: "bg-emerald-500/10", icon: Activity },
    { label: "Waiting", value: counts.waiting, color: "text-amber-500", bg: "bg-amber-500/10", icon: Timer },
    { label: "Idle", value: counts.idle, color: "text-zinc-500", bg: "bg-zinc-500/10", icon: Pause },
    { label: "Errors", value: counts.error, color: "text-red-500", bg: "bg-red-500/10", icon: XCircle },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3"
          >
            <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg", card.bg)}>
              <Icon size={16} className={card.color} />
            </div>
            <div>
              <div className={cn("text-lg font-bold", card.color)}>{card.value}</div>
              <div className="text-[11px] text-muted-foreground">{card.label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Component ─── */

export function SubAgentsList() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SubAgentStatus | "all">("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { agents, loading, error, total, refresh } = useSubAgents(page, PAGE_SIZE);

  // If an agent is selected, show the detail view
  if (selectedAgentId) {
    return (
      <div className="h-full flex flex-col">
        <SubAgentDetail
          agentId={selectedAgentId}
          onBack={() => setSelectedAgentId(null)}
        />
      </div>
    );
  }

  // Client-side filtering
  const filteredAgents = useMemo(() => {
    let result = agents;

    if (statusFilter !== "all") {
      result = result.filter((a) => a.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name?.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.agent_type?.toLowerCase().includes(q) ||
          a.current_task?.toLowerCase().includes(q) ||
          a.parent_conversation_title?.toLowerCase().includes(q) ||
          a.parent_conversation_id?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [agents, statusFilter, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = searchQuery.trim() !== "" || statusFilter !== "all";

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
  }, []);

  const goToPage = useCallback(
    (p: number) => setPage(Math.max(1, Math.min(p, totalPages))),
    [totalPages]
  );

  // Status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    agents.forEach((a) => {
      counts[a.status] = (counts[a.status] || 0) + 1;
    });
    return counts;
  }, [agents]);

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold text-foreground">Sub-Agents</h2>
            <Badge variant="outline" className="text-[10px]">READ-ONLY</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor spawned sub-agent activity, status, and parent conversations
          </p>
        </div>

        {/* Summary cards */}
        {agents.length > 0 && <SummaryCards agents={agents} />}

        {/* Table container */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full h-8 pl-8 pr-8 rounded-lg text-sm",
                  "bg-muted/50 border border-border/60 text-foreground placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
                  "transition-all duration-200"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium",
                "border transition-all duration-200",
                showFilters || hasFilters
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Filter size={13} />
              Filters
              {hasFilters && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[10px]">
                  {statusFilter !== "all" ? 1 : 0}
                </span>
              )}
            </button>

            {/* Refresh */}
            <button
              onClick={refresh}
              disabled={loading}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-lg",
                "text-muted-foreground hover:text-foreground hover:bg-muted",
                "border border-border/60 transition-all duration-200",
                loading && "opacity-50 cursor-not-allowed"
              )}
              title="Refresh sub-agents"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </button>

            {/* Count */}
            <div className="hidden sm:flex items-center text-xs text-muted-foreground ml-1">
              {total > 0 && <span>{total} total</span>}
            </div>
          </div>

          {/* Filter bar (collapsible) */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-200 ease-out border-b border-border/60",
              showFilters ? "max-h-24 opacity-100" : "max-h-0 opacity-0 border-b-0"
            )}
          >
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Status:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {(["all", "running", "waiting", "idle", "completed", "error", "stopped"] as const).map((s) => {
                    const isSelected = statusFilter === s;
                    const count = statusCounts[s] || 0;
                    return (
                      <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium",
                          "transition-all duration-150",
                          isSelected
                            ? "bg-primary/15 text-primary border border-primary/30"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                        )}
                      >
                        {s === "all" ? "All" : STATUS_CONFIG[s].label}
                        {count > 0 && (
                          <span
                            className={cn(
                              "text-[10px] font-normal",
                              isSelected ? "text-primary/70" : "text-muted-foreground/60"
                            )}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
                >
                  <X size={12} />
                  Clear all
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          {loading && agents.length === 0 ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={refresh} />
          ) : filteredAgents.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider border-b border-border/30 bg-muted/20">
                      <th className="px-4 py-2 text-left font-medium">Agent</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium">Parent Conversation</th>
                      <th className="px-4 py-2 text-left font-medium">Current Task</th>
                      <th className="px-4 py-2 text-right font-medium">Duration</th>
                      <th className="px-4 py-2 text-right font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.map((agent) => (
                      <AgentTableRow key={agent.id} agent={agent} onSelect={setSelectedAgentId} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden">
                {filteredAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onSelect={setSelectedAgentId} />
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/10">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
                {hasFilters && filteredAgents.length < agents.length && (
                  <span className="ml-2">
                    ({filteredAgents.length} of {agents.length} shown)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(1)}
                  disabled={page <= 1}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md",
                    "text-muted-foreground transition-all duration-150",
                    page <= 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-muted hover:text-foreground"
                  )}
                  title="First page"
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md",
                    "text-muted-foreground transition-all duration-150",
                    page <= 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-muted hover:text-foreground"
                  )}
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {generatePageNumbers(page, totalPages).map((p, idx) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="w-7 h-7 flex items-center justify-center text-xs text-muted-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-md text-xs font-medium",
                        "transition-all duration-150",
                        p === page
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md",
                    "text-muted-foreground transition-all duration-150",
                    page >= totalPages ? "opacity-30 cursor-not-allowed" : "hover:bg-muted hover:text-foreground"
                  )}
                  title="Next page"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={page >= totalPages}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-md",
                    "text-muted-foreground transition-all duration-150",
                    page >= totalPages ? "opacity-30 cursor-not-allowed" : "hover:bg-muted hover:text-foreground"
                  )}
                  title="Last page"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Generate a compact set of page numbers with ellipsis */
function generatePageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  if (current < total - 2) pages.push("...");
  pages.push(total);

  return pages;
}
