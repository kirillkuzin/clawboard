"use client";

import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useConversations } from "@/hooks/use-conversations";
import { Badge } from "@/components/ui/badge";
import type { Conversation, ConversationStatus } from "@/lib/types/conversation";
import {
  Search,
  Filter,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Clock,
  User,
  Bot,
  Hash,
  AlertCircle,
  Loader2,
  X,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<
  ConversationStatus,
  { label: string; variant: "success" | "default" | "destructive" | "secondary" | "warning"; dotColor: string }
> = {
  active: { label: "Active", variant: "success", dotColor: "bg-emerald-400" },
  completed: { label: "Completed", variant: "secondary", dotColor: "bg-zinc-400" },
  error: { label: "Error", variant: "destructive", dotColor: "bg-red-400" },
  archived: { label: "Archived", variant: "warning", dotColor: "bg-amber-400" },
};

function StatusBadge({ status }: { status: ConversationStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.active;
  return (
    <Badge variant={config.variant} className="gap-1.5 text-[11px]">
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
      {config.label}
    </Badge>
  );
}

function formatRelativeTime(dateStr: string): string {
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

function formatDateTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
}

interface ConversationRowProps {
  conversation: Conversation;
}

function ConversationRow({ conversation }: ConversationRowProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 px-4 py-3 border-b border-border/40",
        "hover:bg-muted/30 transition-colors duration-150 cursor-default"
      )}
    >
      {/* Icon */}
      <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-primary/5 text-primary/60 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        <MessageSquare size={16} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">
            {conversation.title || `Conversation ${conversation.id.slice(0, 8)}`}
          </span>
          <StatusBadge status={conversation.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {conversation.agent_name && (
            <span className="flex items-center gap-1 truncate">
              <Bot size={12} className="shrink-0" />
              {conversation.agent_name}
            </span>
          )}
          {conversation.channel && (
            <span className="flex items-center gap-1 truncate">
              <Hash size={12} className="shrink-0" />
              {conversation.channel}
            </span>
          )}
          {conversation.metadata?.user_name && (
            <span className="flex items-center gap-1 truncate">
              <User size={12} className="shrink-0" />
              {conversation.metadata.user_name}
            </span>
          )}
        </div>
      </div>

      {/* Message count */}
      <div className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MessageSquare size={12} />
        <span>{conversation.message_count}</span>
      </div>

      {/* Timestamp */}
      <div
        className="shrink-0 text-xs text-muted-foreground text-right min-w-[70px]"
        title={formatDateTime(conversation.updated_at)}
      >
        <div className="flex items-center gap-1 justify-end">
          <Clock size={12} className="shrink-0" />
          {formatRelativeTime(conversation.updated_at)}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <MessageSquare size={24} className="text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        {hasFilters ? "No matching conversations" : "No conversations yet"}
      </h3>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        {hasFilters
          ? "Try adjusting your search or filters to find what you're looking for."
          : "Conversations will appear here once agents start processing requests."}
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
        Failed to load conversations
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
      <p className="text-xs text-muted-foreground">Loading conversations...</p>
    </div>
  );
}

export function ConversationList() {
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { conversations, loading, error, total, refresh } = useConversations(page, PAGE_SIZE);

  // Client-side filtering (since the API may not support query params for search/filter)
  const filteredConversations = useMemo(() => {
    let result = conversations;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    // Channel filter
    if (channelFilter !== "all") {
      result = result.filter((c) => c.channel === channelFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.title?.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.agent_name?.toLowerCase().includes(q) ||
          c.metadata?.user_name?.toLowerCase().includes(q) ||
          c.channel?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [conversations, statusFilter, channelFilter, searchQuery]);

  // Extract unique channels from current page data
  const availableChannels = useMemo(() => {
    const channels = new Set<string>();
    conversations.forEach((c) => {
      if (c.channel) channels.add(c.channel);
    });
    return Array.from(channels).sort();
  }, [conversations]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = searchQuery.trim() !== "" || statusFilter !== "all" || channelFilter !== "all";

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setStatusFilter("all");
    setChannelFilter("all");
  }, []);

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(p, totalPages));
      setPage(clamped);
    },
    [totalPages]
  );

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: conversations.length };
    conversations.forEach((c) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return counts;
  }, [conversations]);

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Conversations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and monitor all agent conversations
          </p>
        </div>

        {/* Toolbar */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Search + actions bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
            {/* Search input */}
            <div className="relative flex-1 max-w-sm">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search conversations..."
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
                  {(statusFilter !== "all" ? 1 : 0) + (channelFilter !== "all" ? 1 : 0)}
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
              title="Refresh conversations"
            >
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </button>

            {/* Total count */}
            <div className="hidden sm:flex items-center text-xs text-muted-foreground ml-1">
              {total > 0 && (
                <span>
                  {total} total
                </span>
              )}
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
              {/* Status filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Status:</span>
                <div className="flex items-center gap-1">
                  {(["all", "active", "completed", "error", "archived"] as const).map((s) => {
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
                          <span className={cn(
                            "text-[10px] font-normal",
                            isSelected ? "text-primary/70" : "text-muted-foreground/60"
                          )}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Channel filter */}
              {availableChannels.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Channel:</span>
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className={cn(
                      "h-7 px-2 rounded-md text-[11px] font-medium",
                      "bg-muted/50 border border-border/60 text-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-primary/30",
                      "transition-all duration-150 cursor-pointer"
                    )}
                  >
                    <option value="all">All channels</option>
                    {availableChannels.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Clear filters */}
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

          {/* Content area */}
          {loading && conversations.length === 0 ? (
            <LoadingState />
          ) : error ? (
            <ErrorState error={error} onRetry={refresh} />
          ) : filteredConversations.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <div>
              {/* Table header */}
              <div className="hidden sm:flex items-center gap-4 px-4 py-2 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider border-b border-border/30 bg-muted/20">
                <div className="w-9" /> {/* Icon spacer */}
                <div className="flex-1">Conversation</div>
                <div className="w-16 text-center">Messages</div>
                <div className="w-[70px] text-right">Updated</div>
              </div>

              {/* Rows */}
              {filteredConversations.map((conversation) => (
                <ConversationRow key={conversation.id} conversation={conversation} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-muted/10">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
                {hasFilters && filteredConversations.length < conversations.length && (
                  <span className="ml-2">
                    ({filteredConversations.length} of {conversations.length} shown)
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
                    page <= 1
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-muted hover:text-foreground"
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
                    page <= 1
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-muted hover:text-foreground"
                  )}
                  title="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>

                {/* Page numbers */}
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
                    page >= totalPages
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-muted hover:text-foreground"
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
                    page >= totalPages
                      ? "opacity-30 cursor-not-allowed"
                      : "hover:bg-muted hover:text-foreground"
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
function generatePageNumbers(
  current: number,
  total: number
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}
