"use client";

import React, { useState } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  useGatewaySessions,
  useGatewaySessionDetail,
  type GatewayChatMessage,
} from "@/hooks/use-gateway-sessions";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  MessageSquare,
  Loader2,
  ArrowLeft,
  ChevronRight,
  User,
  Bot,
  Wrench,
  Info,
} from "lucide-react";

export function ConversationList() {
  return (
    <GatewayGuard>
      <ConversationListInner />
    </GatewayGuard>
  );
}

function ConversationListInner() {
  const sessions = useGatewaySessions();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filteredSessions = sessions.sessions.filter(
    (s) =>
      !searchQuery ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.label ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.channel ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.agentName ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (selectedKey) {
    return (
      <SessionDetail
        sessionKey={selectedKey}
        onBack={() => setSelectedKey(null)}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Sessions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Active and recent conversation sessions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={sessions.refresh}
            disabled={sessions.loading}
          >
            <RefreshCw
              size={14}
              className={cn(sessions.loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {sessions.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{sessions.error}</span>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {sessions.loading && sessions.sessions.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading sessions...
          </div>
        )}

        {/* Empty */}
        {!sessions.loading && filteredSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {searchQuery ? "No sessions match" : "No sessions found"}
            </p>
            <p className="text-xs mt-1">
              Sessions will appear here when conversations are active
            </p>
          </div>
        )}

        {/* Session list */}
        <div className="space-y-2">
          {filteredSessions.map((session) => (
            <button
              key={session.key}
              onClick={() => setSelectedKey(session.key)}
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/20 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <MessageSquare
                  size={16}
                  className="text-muted-foreground shrink-0"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {session.label || session.key}
                    </span>
                    {session.channel && (
                      <Badge
                        variant="outline"
                        className="text-[10px] capitalize shrink-0"
                      >
                        {session.channel}
                      </Badge>
                    )}
                    {session.agentName && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {session.agentName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {session.label && session.key !== session.label && (
                      <span className="text-xs text-muted-foreground font-mono truncate">
                        {session.key}
                      </span>
                    )}
                    {session.lastMessageAt && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(session.lastMessageAt)}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight
                  size={16}
                  className="text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                />
              </div>
            </button>
          ))}
        </div>

        {filteredSessions.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {filteredSessions.length} session
            {filteredSessions.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Detail View
// ---------------------------------------------------------------------------

function SessionDetail({
  sessionKey,
  onBack,
}: {
  sessionKey: string;
  onBack: () => void;
}) {
  const detail = useGatewaySessionDetail(sessionKey);

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft size={16} />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">
              {detail.session?.label || sessionKey}
            </h2>
            {detail.session?.channel && (
              <p className="text-xs text-muted-foreground">
                Channel: {detail.session.channel}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={detail.refresh}
            disabled={detail.loading}
          >
            <RefreshCw
              size={14}
              className={cn(detail.loading && "animate-spin")}
            />
          </Button>
        </div>

        {detail.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span>{detail.error}</span>
          </div>
        )}

        {/* Loading */}
        {detail.loading && detail.messages.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading messages...
          </div>
        )}

        {/* Messages */}
        <div className="space-y-3">
          {detail.messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} />
          ))}
        </div>

        {!detail.loading && detail.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No messages yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message Bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: GatewayChatMessage }) {
  const role = message.role;
  const isUser = role === "user" || role === "human";
  const isAssistant = role === "assistant" || role === "agent" || role === "bot";
  const isTool = role === "tool" || role === "function";

  const content =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .filter((b) => b.type === "text")
            .map((b) => b.text ?? "")
            .join("\n")
        : String(message.content);

  const RoleIcon = isUser
    ? User
    : isAssistant
      ? Bot
      : isTool
        ? Wrench
        : Info;

  return (
    <div
      className={cn(
        "flex gap-3 p-3 rounded-lg",
        isUser && "bg-primary/5 border border-primary/10",
        isAssistant && "bg-muted/30",
        isTool && "bg-amber-500/5 border border-amber-500/10",
        !isUser && !isAssistant && !isTool && "bg-muted/20"
      )}
    >
      <div className="shrink-0 mt-0.5">
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center",
            isUser && "bg-primary/10 text-primary",
            isAssistant && "bg-foreground/10 text-foreground",
            isTool && "bg-amber-500/10 text-amber-500",
            !isUser && !isAssistant && !isTool && "bg-muted text-muted-foreground"
          )}
        >
          <RoleIcon size={12} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold capitalize text-foreground">
            {role}
          </span>
          {message.timestamp && (
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(message.timestamp)}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {content || (
            <span className="text-muted-foreground italic">Empty</span>
          )}
        </div>
      </div>
    </div>
  );
}
