"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Bot,
  User,
  Terminal,
  Settings,
  Clock,
  Hash,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  Loader2,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  Message,
  MessageRole,
  ConversationDetailResponse,
  ConversationStatus,
} from "@/lib/types/conversation";
import { useConversationDetail } from "@/hooks/use-conversations";

// ── Helpers ──

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return iso;
  }
}

function statusVariant(
  status: ConversationStatus
): "success" | "default" | "destructive" | "warning" {
  switch (status) {
    case "active":
      return "success";
    case "completed":
      return "default";
    case "error":
      return "destructive";
    case "archived":
      return "warning";
    default:
      return "default";
  }
}

function roleIcon(role: MessageRole) {
  switch (role) {
    case "user":
      return <User size={14} />;
    case "agent":
      return <Bot size={14} />;
    case "tool":
      return <Terminal size={14} />;
    case "system":
      return <Settings size={14} />;
    default:
      return <MessageSquare size={14} />;
  }
}

function roleLabel(role: MessageRole): string {
  switch (role) {
    case "user":
      return "User";
    case "agent":
      return "Agent";
    case "tool":
      return "Tool";
    case "system":
      return "System";
    default:
      return role;
  }
}

function roleColors(role: MessageRole) {
  switch (role) {
    case "user":
      return {
        bg: "bg-blue-500/10",
        border: "border-blue-500/20",
        icon: "text-blue-400",
        label: "text-blue-400",
      };
    case "agent":
      return {
        bg: "bg-violet-500/10",
        border: "border-violet-500/20",
        icon: "text-violet-400",
        label: "text-violet-400",
      };
    case "tool":
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/20",
        icon: "text-amber-400",
        label: "text-amber-400",
      };
    case "system":
      return {
        bg: "bg-gray-500/10",
        border: "border-gray-500/20",
        icon: "text-gray-400",
        label: "text-gray-400",
      };
    default:
      return {
        bg: "bg-muted",
        border: "border-border",
        icon: "text-muted-foreground",
        label: "text-muted-foreground",
      };
  }
}

// ── Message Bubble ──

function MessageBubble({ message }: { message: Message }) {
  const [metaExpanded, setMetaExpanded] = React.useState(false);
  const colors = roleColors(message.role);
  const hasMeta =
    message.metadata && Object.keys(message.metadata).length > 0;

  return (
    <div
      className={cn(
        "group relative flex gap-3 py-3 px-4 rounded-lg transition-colors duration-150",
        "hover:bg-muted/30"
      )}
    >
      {/* Role icon */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
          colors.bg,
          colors.icon
        )}
      >
        {roleIcon(message.role)}
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        {/* Header: role + timestamp */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn("text-xs font-semibold uppercase", colors.label)}
          >
            {message.metadata?.agent_name || roleLabel(message.role)}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            {formatTimestamp(message.timestamp)}
          </span>
          {message.metadata?.tokens && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Zap size={10} />
              {message.metadata.tokens} tokens
            </span>
          )}
          {message.metadata?.duration_ms && (
            <span className="text-[10px] text-muted-foreground">
              {message.metadata.duration_ms}ms
            </span>
          )}
        </div>

        {/* Tool call indicator */}
        {message.role === "tool" && message.metadata?.tool_name && (
          <div className="mb-1.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
              {message.metadata.tool_name}
            </Badge>
          </div>
        )}

        {/* Message body */}
        <div
          className={cn(
            "text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed",
            message.role === "system" && "italic text-muted-foreground",
            message.role === "tool" && "font-mono text-xs bg-muted/50 p-2 rounded border border-border"
          )}
        >
          {message.content}
        </div>

        {/* Metadata expander */}
        {hasMeta && (
          <button
            onClick={() => setMetaExpanded((v) => !v)}
            className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {metaExpanded ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
            Metadata
          </button>
        )}
        {hasMeta && metaExpanded && (
          <div className="mt-1 p-2 rounded bg-muted/30 border border-border text-[11px] font-mono text-muted-foreground overflow-x-auto">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(message.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Conversation Header ──

function ConversationHeader({
  conversation,
  onBack,
  onRefresh,
  refreshing,
}: {
  conversation: ConversationDetailResponse;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        aria-label="Back to conversations list"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Title & metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {conversation.title || `Conversation ${conversation.id}`}
          </h3>
          <Badge variant={statusVariant(conversation.status)}>
            {conversation.status}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Hash size={10} />
            {conversation.id}
          </span>
          {conversation.channel && (
            <span className="flex items-center gap-1">
              <MessageSquare size={10} />
              {conversation.channel}
            </span>
          )}
          {conversation.agent_name && (
            <span className="flex items-center gap-1">
              <Bot size={10} />
              {conversation.agent_name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatRelativeTime(conversation.updated_at)}
          </span>
          <span>
            {conversation.messages?.length ?? conversation.message_count}{" "}
            messages
          </span>
          {conversation.metadata?.user_name && (
            <span className="flex items-center gap-1">
              <User size={10} />
              {conversation.metadata.user_name as string}
            </span>
          )}
        </div>
        {/* Tags */}
        {conversation.metadata?.tags &&
          Array.isArray(conversation.metadata.tags) &&
          conversation.metadata.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              {(conversation.metadata.tags as string[]).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
      </div>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
        aria-label="Refresh conversation"
      >
        <RefreshCw
          size={14}
          className={cn(refreshing && "animate-spin")}
        />
      </button>
    </div>
  );
}

// ── Message Thread ──

function MessageThread({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when messages change
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <MessageSquare
            size={32}
            className="mx-auto mb-3 opacity-40"
          />
          <p className="text-sm">No messages in this conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2">
      <div className="max-w-3xl mx-auto space-y-1">
        {messages.map((message, index) => (
          <React.Fragment key={message.id || index}>
            {/* Date separator when day changes */}
            {index > 0 &&
              new Date(message.timestamp).toDateString() !==
                new Date(messages[index - 1].timestamp).toDateString() && (
                <div className="flex items-center gap-3 py-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {new Date(message.timestamp).toLocaleDateString(
                      undefined,
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      }
                    )}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
            <MessageBubble message={message} />
          </React.Fragment>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Empty / Error / Loading states ──

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center text-muted-foreground">
        <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
        <h3 className="text-lg font-medium text-foreground mb-1">
          No conversation selected
        </h3>
        <p className="text-sm">
          Select a conversation from the list to view its message thread
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center text-muted-foreground">
        <Loader2 size={32} className="mx-auto mb-3 animate-spin opacity-50" />
        <p className="text-sm">Loading conversation...</p>
      </div>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <AlertCircle
          size={32}
          className="mx-auto mb-3 text-destructive opacity-60"
        />
        <h3 className="text-sm font-medium text-foreground mb-1">
          Failed to load conversation
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">
          {error}
        </p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    </div>
  );
}

// ── Main Detail Component ──

export interface ConversationDetailProps {
  conversationId: string | null;
  onBack: () => void;
}

export function ConversationDetail({
  conversationId,
  onBack,
}: ConversationDetailProps) {
  const { conversation, loading, error, refresh } =
    useConversationDetail(conversationId);

  if (!conversationId) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <EmptyState />
      </Card>
    );
  }

  if (loading && !conversation) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <LoadingState />
      </Card>
    );
  }

  if (error && !conversation) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ErrorState error={error} onRetry={refresh} />
      </Card>
    );
  }

  if (!conversation) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <EmptyState />
      </Card>
    );
  }

  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <ConversationHeader
        conversation={conversation}
        onBack={onBack}
        onRefresh={refresh}
        refreshing={loading}
      />
      <MessageThread messages={conversation.messages ?? []} />
      {/* Active conversation indicator */}
      {conversation.status === "active" && (
        <div className="px-4 py-2 border-t border-border bg-emerald-500/5 flex items-center gap-2 text-xs text-emerald-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          Live — auto-refreshing every 5 seconds
        </div>
      )}
    </Card>
  );
}
