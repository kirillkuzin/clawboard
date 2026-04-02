"use client";

import React, { useState } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bot,
  Clock,
  RefreshCw,
  AlertCircle,
  Loader2,
  Activity,
  Pause,
  CheckCircle2,
  XCircle,
  StopCircle,
  CircleDot,
  Search,
} from "lucide-react";
import type { SubAgent, SubAgentStatus } from "@/lib/types";
import { useSubAgents } from "@/hooks/use-sub-agents";
import { SubAgentDetail } from "./sub-agent-detail";

// ── Helpers ──

function statusVariant(
  status: SubAgentStatus
): "success" | "default" | "destructive" | "warning" | "secondary" {
  switch (status) {
    case "running":
      return "success";
    case "idle":
      return "secondary";
    case "completed":
      return "default";
    case "error":
      return "destructive";
    case "waiting":
      return "warning";
    case "stopped":
      return "secondary";
    default:
      return "default";
  }
}

function statusIcon(status: SubAgentStatus) {
  switch (status) {
    case "running":
      return <Activity size={12} className="text-emerald-500" />;
    case "idle":
      return <Pause size={12} className="text-muted-foreground" />;
    case "completed":
      return <CheckCircle2 size={12} className="text-primary" />;
    case "error":
      return <XCircle size={12} className="text-destructive" />;
    case "waiting":
      return <CircleDot size={12} className="text-amber-500" />;
    case "stopped":
      return <StopCircle size={12} className="text-muted-foreground" />;
    default:
      return <Bot size={12} />;
  }
}

// ── Agent List Item ──

function AgentListItem({
  agent,
  selected,
  onClick,
}: {
  agent: SubAgent;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all duration-150",
        "hover:bg-muted/50 hover:border-primary/30",
        selected
          ? "bg-primary/5 border-primary/40 shadow-sm"
          : "bg-card border-border"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div
          className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
            agent.status === "running" && "bg-emerald-500/10",
            agent.status === "error" && "bg-destructive/10",
            agent.status === "waiting" && "bg-amber-500/10",
            agent.status === "idle" && "bg-muted",
            agent.status === "completed" && "bg-primary/10",
            agent.status === "stopped" && "bg-muted"
          )}
        >
          {statusIcon(agent.status)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {agent.name}
            </span>
            <Badge
              variant={statusVariant(agent.status)}
              className="text-[10px] px-1.5 py-0"
            >
              {agent.status}
            </Badge>
          </div>
          {agent.current_task && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {agent.current_task}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            {agent.agent_type && (
              <span className="font-mono">{agent.agent_type}</span>
            )}
            {agent.started_at && (
              <span className="flex items-center gap-0.5">
                <Clock size={9} />
                {formatRelativeTime(agent.started_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Filter Bar ──

function FilterBar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  total,
}: {
  filter: SubAgentStatus | "all";
  onFilterChange: (f: SubAgentStatus | "all") => void;
  search: string;
  onSearchChange: (s: string) => void;
  total: number;
}) {
  const filters: { value: SubAgentStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "running", label: "Running" },
    { value: "waiting", label: "Waiting" },
    { value: "idle", label: "Idle" },
    { value: "completed", label: "Completed" },
    { value: "error", label: "Error" },
    { value: "stopped", label: "Stopped" },
  ];

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search agents..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilterChange(f.value)}
            className={cn(
              "text-[10px] font-medium px-2 py-1 rounded-full border transition-colors",
              filter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/30"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {total} total
        </span>
      </div>
    </div>
  );
}

// ── Main Section ──

export function SubAgentsSection() {
  const { agents, loading, error, total, refresh } = useSubAgents();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubAgentStatus | "all">("all");
  const [search, setSearch] = useState("");

  // If detail view is shown, render it full-width
  if (selectedId) {
    return (
      <div className="h-full flex flex-col">
        <SubAgentDetail
          agentId={selectedId}
          onBack={() => setSelectedId(null)}
        />
      </div>
    );
  }

  // Filter and search agents
  const filteredAgents = agents.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.current_task?.toLowerCase().includes(q) ?? false) ||
        (a.agent_type?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Sub-Agents</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor sub-agent activity and status (read-only)
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={14}
              className={cn(loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4">
          <FilterBar
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            total={total || agents.length}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle
              size={14}
              className="flex-shrink-0 text-destructive mt-0.5"
            />
            <div>
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={refresh}
                className="text-xs text-destructive/80 underline hover:no-underline mt-1"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && agents.length === 0 && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center text-muted-foreground">
              <Loader2
                size={32}
                className="mx-auto mb-3 animate-spin opacity-50"
              />
              <p className="text-sm">Loading sub-agents...</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredAgents.length === 0 && (
          <Card>
            <CardContent className="py-16">
              <div className="text-center text-muted-foreground">
                <Bot size={40} className="mx-auto mb-3 opacity-30" />
                <h3 className="text-sm font-medium text-foreground mb-1">
                  {search || filter !== "all"
                    ? "No matching agents"
                    : "No sub-agents found"}
                </h3>
                <p className="text-xs">
                  {search || filter !== "all"
                    ? "Try adjusting your filters or search query"
                    : "Sub-agents will appear here when they are spawned by the OpenClaw instance"}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Agent list */}
        {filteredAgents.length > 0 && (
          <div className="space-y-2">
            {filteredAgents.map((agent) => (
              <AgentListItem
                key={agent.id}
                agent={agent}
                selected={false}
                onClick={() => setSelectedId(agent.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
