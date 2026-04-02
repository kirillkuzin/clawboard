"use client";

import React, { useState } from "react";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  useGatewayAgents,
  type GatewayAgent,
} from "@/hooks/use-gateway-agents";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  Bot,
  Loader2,
  ChevronRight,
} from "lucide-react";

export function SubAgentsList() {
  return (
    <GatewayGuard>
      <AgentsListInner />
    </GatewayGuard>
  );
}

function AgentsListInner() {
  const agents = useGatewayAgents();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredAgents = agents.agents.filter(
    (a) =>
      !searchQuery ||
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedAgent = selectedId
    ? agents.agents.find((a) => a.id === selectedId)
    : null;

  if (selectedAgent) {
    return (
      <AgentDetail
        agent={selectedAgent}
        onBack={() => setSelectedId(null)}
        onRefresh={agents.fetchAgents}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Agents</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Available agents in your OpenClaw instance
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={agents.fetchAgents}
            disabled={agents.loading}
          >
            <RefreshCw
              size={14}
              className={cn(agents.loading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {agents.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{agents.error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => agents.setError(null)}
              className="text-destructive hover:text-destructive"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {agents.loading && agents.agents.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading agents...
          </div>
        )}

        {/* Empty */}
        {!agents.loading && filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Bot size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {searchQuery ? "No agents match" : "No agents found"}
            </p>
            <p className="text-xs mt-1">
              Agents are configured in your OpenClaw config
            </p>
          </div>
        )}

        {/* Agent list */}
        <div className="space-y-2">
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedId(agent.id)}
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/20 hover:border-primary/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {agent.emoji ? (
                    <span className="text-lg">{agent.emoji}</span>
                  ) : (
                    <Bot size={16} className="text-primary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {agent.name}
                    </span>
                    {agent.model && (
                      <Badge variant="outline" className="text-[10px]">
                        {agent.model}
                      </Badge>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {agent.description}
                    </p>
                  )}
                </div>

                <ChevronRight
                  size={16}
                  className="text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                />
              </div>
            </button>
          ))}
        </div>

        {filteredAgents.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {filteredAgents.length} agent
            {filteredAgents.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Detail
// ---------------------------------------------------------------------------

function AgentDetail({
  agent,
  onBack,
  onRefresh,
}: {
  agent: GatewayAgent;
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </Button>
          <div className="flex items-center gap-2 flex-1">
            {agent.emoji && <span className="text-2xl">{agent.emoji}</span>}
            <h2 className="text-lg font-bold text-foreground">{agent.name}</h2>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw size={14} />
          </Button>
        </div>

        {/* Info cards */}
        <div className="space-y-4">
          {/* Basic info */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Agent Info
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">ID</dt>
                <dd className="font-mono text-xs text-foreground mt-0.5">
                  {agent.id}
                </dd>
              </div>
              {agent.model && (
                <div>
                  <dt className="text-xs text-muted-foreground">Model</dt>
                  <dd className="font-mono text-xs text-foreground mt-0.5">
                    {agent.model}
                  </dd>
                </div>
              )}
              {agent.fallbackModel && (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Fallback Model
                  </dt>
                  <dd className="font-mono text-xs text-foreground mt-0.5">
                    {agent.fallbackModel}
                  </dd>
                </div>
              )}
              {agent.description && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Description</dt>
                  <dd className="text-foreground mt-0.5">
                    {agent.description}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* System prompt */}
          {agent.systemPrompt && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-2">
                System Prompt
              </h3>
              <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {agent.systemPrompt}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {agent.createdAt && (
              <span>Created: {formatRelativeTime(agent.createdAt)}</span>
            )}
            {agent.updatedAt && (
              <span>Updated: {formatRelativeTime(agent.updatedAt)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
