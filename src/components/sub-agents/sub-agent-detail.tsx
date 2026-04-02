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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Bot,
  Clock,
  Hash,
  RefreshCw,
  AlertCircle,
  Loader2,
  StopCircle,
  Skull,
  Activity,
  Cpu,
  Zap,
  Timer,
  MemoryStick,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Pause,
  CircleDot,
  XCircle,
} from "lucide-react";
import type { SubAgentStatus } from "@/lib/types";
import {
  useSubAgentDetail,
  type SubAgentActivity,
  type SubAgentDetailData,
} from "@/hooks/use-sub-agent-detail";

// ── Helpers ──

function formatTimestamp(iso?: string): string {
  if (!iso) return "—";
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

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

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
      return <Activity size={14} className="text-emerald-500" />;
    case "idle":
      return <Pause size={14} className="text-muted-foreground" />;
    case "completed":
      return <CheckCircle2 size={14} className="text-primary" />;
    case "error":
      return <XCircle size={14} className="text-destructive" />;
    case "waiting":
      return <CircleDot size={14} className="text-amber-500" />;
    case "stopped":
      return <StopCircle size={14} className="text-muted-foreground" />;
    default:
      return <Bot size={14} />;
  }
}

function isAgentActive(status?: SubAgentStatus): boolean {
  return status === "running" || status === "waiting" || status === "idle";
}

// ── Activity Item ──

function ActivityItem({ activity }: { activity: SubAgentActivity }) {
  const [expanded, setExpanded] = useState(false);
  const hasMeta =
    activity.metadata && Object.keys(activity.metadata).length > 0;

  const typeColors: Record<string, string> = {
    task_started: "text-emerald-500 bg-emerald-500/10",
    task_completed: "text-blue-500 bg-blue-500/10",
    skill_executed: "text-violet-500 bg-violet-500/10",
    error: "text-destructive bg-destructive/10",
    message_sent: "text-amber-500 bg-amber-500/10",
    message_received: "text-cyan-500 bg-cyan-500/10",
    tool_call: "text-orange-500 bg-orange-500/10",
    state_change: "text-pink-500 bg-pink-500/10",
  };

  const colorClass =
    typeColors[activity.type] || "text-muted-foreground bg-muted";

  return (
    <div className="group flex gap-3 py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
      {/* Type icon */}
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
          colorClass
        )}
      >
        <Zap size={12} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {activity.type}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock size={10} />
            {formatTimestamp(activity.timestamp)}
          </span>
        </div>
        <p className="text-sm text-foreground">{activity.description}</p>

        {/* Metadata expander */}
        {hasMeta && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Details
            </button>
            {expanded && (
              <div className="mt-1 p-2 rounded bg-muted/30 border border-border text-[11px] font-mono text-muted-foreground overflow-x-auto">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(activity.metadata, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Info Grid ──

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors">
      <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground flex-1 min-w-0 truncate">
        {value}
      </span>
    </div>
  );
}

// ── Stop/Kill Confirmation Dialog ──

type ActionType = "stop" | "kill";

function StopKillDialog({
  open,
  onOpenChange,
  actionType,
  agentName,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionType: ActionType;
  agentName: string;
  onConfirm: () => void;
  loading: boolean;
}) {
  const isKill = actionType === "kill";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isKill ? (
              <Skull size={18} className="text-destructive" />
            ) : (
              <StopCircle size={18} className="text-amber-500" />
            )}
            {isKill ? "Force Kill Agent" : "Stop Agent"}
          </DialogTitle>
          <DialogDescription>
            {isKill ? (
              <>
                Are you sure you want to <strong>force kill</strong> the agent{" "}
                <strong className="text-foreground">{agentName}</strong>? This
                will immediately terminate the agent without graceful shutdown.
                Any in-progress work will be lost.
              </>
            ) : (
              <>
                Are you sure you want to <strong>stop</strong> the agent{" "}
                <strong className="text-foreground">{agentName}</strong>? The
                agent will attempt a graceful shutdown, finishing any current
                task before stopping.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isKill && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle
              size={16}
              className="flex-shrink-0 text-destructive mt-0.5"
            />
            <p className="text-xs text-destructive">
              Force killing an agent is a destructive action. It may leave
              conversations in an inconsistent state and cause data loss. Only
              use this if the agent is unresponsive to a normal stop.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant={isKill ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className={cn(!isKill && "bg-amber-600 hover:bg-amber-700 text-white")}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {isKill ? "Killing..." : "Stopping..."}
              </>
            ) : (
              <>
                {isKill ? <Skull size={14} /> : <StopCircle size={14} />}
                {isKill ? "Force Kill" : "Stop Agent"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Agent Header ──

function AgentHeader({
  agent,
  onBack,
  onRefresh,
  refreshing,
  onStop,
  onKill,
}: {
  agent: SubAgentDetailData;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onStop: () => void;
  onKill: () => void;
}) {
  const active = isAgentActive(agent.status);

  return (
    <div className="flex items-start gap-3 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        aria-label="Back to sub-agents list"
      >
        <ArrowLeft size={16} />
      </button>

      {/* Title & metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {agent.name}
          </h3>
          <Badge variant={statusVariant(agent.status)}>
            <span className="flex items-center gap-1">
              {statusIcon(agent.status)}
              {agent.status}
            </span>
          </Badge>
          {agent.agent_type && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {agent.agent_type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <Hash size={10} />
            {agent.id}
          </span>
          {agent.started_at && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              Started {formatRelativeTime(agent.started_at)}
            </span>
          )}
          {agent.parent_conversation_title && (
            <span className="flex items-center gap-1">
              <MessageSquare size={10} />
              {agent.parent_conversation_title}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {active && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              className="text-amber-600 border-amber-600/30 hover:bg-amber-600/10"
            >
              <StopCircle size={14} />
              <span className="hidden sm:inline">Stop</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onKill}
            >
              <Skull size={14} />
              <span className="hidden sm:inline">Kill</span>
            </Button>
          </>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
          aria-label="Refresh agent details"
        >
          <RefreshCw
            size={14}
            className={cn(refreshing && "animate-spin")}
          />
        </button>
      </div>
    </div>
  );
}

// ── Detail Sections ──

function AgentInfoSection({ agent }: { agent: SubAgentDetailData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cpu size={14} className="text-primary" />
          Agent Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <InfoRow
          icon={<Bot size={14} />}
          label="Name"
          value={agent.name}
        />
        <InfoRow
          icon={<Hash size={14} />}
          label="ID"
          value={
            <span className="font-mono text-xs">{agent.id}</span>
          }
        />
        {agent.agent_type && (
          <InfoRow
            icon={<Cpu size={14} />}
            label="Type"
            value={
              <Badge variant="outline" className="text-[10px] font-mono">
                {agent.agent_type}
              </Badge>
            }
          />
        )}
        <InfoRow
          icon={statusIcon(agent.status)}
          label="Status"
          value={
            <Badge variant={statusVariant(agent.status)}>
              {agent.status}
            </Badge>
          }
        />
        {agent.current_task && (
          <InfoRow
            icon={<Activity size={14} />}
            label="Current Task"
            value={agent.current_task}
          />
        )}
        {agent.parent_conversation_id && (
          <InfoRow
            icon={<MessageSquare size={14} />}
            label="Conversation"
            value={
              <span className="text-xs">
                {agent.parent_conversation_title || agent.parent_conversation_id}
              </span>
            }
          />
        )}
        {agent.error_message && (
          <InfoRow
            icon={<AlertCircle size={14} className="text-destructive" />}
            label="Error"
            value={
              <span className="text-destructive text-xs">
                {agent.error_message}
              </span>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function AgentTimingSection({ agent }: { agent: SubAgentDetailData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Timer size={14} className="text-primary" />
          Timing & Resources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <InfoRow
          icon={<Clock size={14} />}
          label="Started"
          value={formatTimestamp(agent.started_at)}
        />
        <InfoRow
          icon={<Clock size={14} />}
          label="Last Updated"
          value={formatTimestamp(agent.updated_at)}
        />
        {agent.completed_at && (
          <InfoRow
            icon={<CheckCircle2 size={14} />}
            label="Completed"
            value={formatTimestamp(agent.completed_at)}
          />
        )}
        {agent.duration_ms != null && (
          <InfoRow
            icon={<Timer size={14} />}
            label="Duration"
            value={formatDuration(agent.duration_ms)}
          />
        )}
        {agent.tokens_used != null && (
          <InfoRow
            icon={<Zap size={14} />}
            label="Tokens Used"
            value={agent.tokens_used.toLocaleString()}
          />
        )}
        {agent.memory_usage_mb != null && (
          <InfoRow
            icon={<MemoryStick size={14} />}
            label="Memory"
            value={`${agent.memory_usage_mb.toFixed(1)} MB`}
          />
        )}
        {agent.skills_used && agent.skills_used.length > 0 && (
          <InfoRow
            icon={<Zap size={14} />}
            label="Skills Used"
            value={
              <div className="flex flex-wrap gap-1">
                {agent.skills_used.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

function AgentMetadataSection({ agent }: { agent: SubAgentDetailData }) {
  const [expanded, setExpanded] = useState(false);
  const hasMeta = agent.metadata && Object.keys(agent.metadata).length > 0;

  if (!hasMeta) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2 flex-1">
            <Hash size={14} className="text-primary" />
            Metadata
          </CardTitle>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs font-mono text-muted-foreground overflow-x-auto">
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(agent.metadata, null, 2)}
            </pre>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ChildAgentsSection({
  children,
}: {
  children: { id: string; name: string; status: string }[];
}) {
  if (!children || children.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Bot size={14} className="text-primary" />
          Child Agents ({children.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {children.map((child) => (
            <div
              key={child.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <Bot size={14} className="text-muted-foreground flex-shrink-0" />
              <span className="text-sm text-foreground flex-1 truncate">
                {child.name}
              </span>
              <Badge
                variant={
                  statusVariant(child.status as SubAgentStatus)
                }
                className="text-[10px]"
              >
                {child.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-mono">
                {child.id.slice(0, 8)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityLog({ activities }: { activities: SubAgentActivity[] }) {
  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity size={14} className="text-primary" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Activity size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No activity recorded yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          Activity Log ({activities.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {activities.map((activity, idx) => (
          <ActivityItem key={activity.id || idx} activity={activity} />
        ))}
      </CardContent>
    </Card>
  );
}

function LogsSection({ logs }: { logs: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!logs || logs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2 flex-1">
            <AlertCircle size={14} className="text-primary" />
            Logs ({logs.length})
          </CardTitle>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs font-mono text-muted-foreground overflow-y-auto max-h-64">
            {logs.map((line, idx) => (
              <div key={idx} className="py-0.5 hover:bg-muted/30">
                <span className="text-muted-foreground/50 mr-2 select-none">
                  {String(idx + 1).padStart(3, " ")}
                </span>
                {line}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── States ──

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center text-muted-foreground">
        <Bot size={48} className="mx-auto mb-4 opacity-30" />
        <h3 className="text-lg font-medium text-foreground mb-1">
          No agent selected
        </h3>
        <p className="text-sm">
          Select a sub-agent from the list to view its details
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
        <p className="text-sm">Loading agent details...</p>
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
          Failed to load agent details
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">{error}</p>
        <Button size="sm" onClick={onRetry}>
          <RefreshCw size={12} />
          Retry
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ──

export interface SubAgentDetailProps {
  agentId: string | null;
  onBack: () => void;
}

export function SubAgentDetail({ agentId, onBack }: SubAgentDetailProps) {
  const {
    agent,
    loading,
    error,
    refresh,
    stopAgent,
    killAgent,
    stopping,
    killing,
  } = useSubAgentDetail(agentId);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: ActionType;
  }>({ open: false, action: "stop" });

  const handleConfirm = async () => {
    let success = false;
    if (confirmDialog.action === "stop") {
      success = await stopAgent();
    } else {
      success = await killAgent();
    }
    if (success) {
      setConfirmDialog({ open: false, action: "stop" });
    }
  };

  if (!agentId) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <EmptyState />
      </Card>
    );
  }

  if (loading && !agent) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <LoadingState />
      </Card>
    );
  }

  if (error && !agent) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <ErrorState error={error} onRetry={refresh} />
      </Card>
    );
  }

  if (!agent) {
    return (
      <Card className="flex-1 flex flex-col overflow-hidden">
        <EmptyState />
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Sticky header */}
        <AgentHeader
          agent={agent}
          onBack={onBack}
          onRefresh={refresh}
          refreshing={loading}
          onStop={() => setConfirmDialog({ open: true, action: "stop" })}
          onKill={() => setConfirmDialog({ open: true, action: "kill" })}
        />

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2 text-xs text-destructive">
            <AlertCircle size={12} />
            {error}
            <button
              onClick={refresh}
              className="ml-auto text-[10px] underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Info + Timing in 2-col grid on larger screens */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <AgentInfoSection agent={agent} />
              <AgentTimingSection agent={agent} />
            </div>

            {/* Error message callout */}
            {agent.error_message && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                <AlertTriangle
                  size={16}
                  className="flex-shrink-0 text-destructive mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    Agent Error
                  </p>
                  <p className="text-xs text-destructive/80 mt-1">
                    {agent.error_message}
                  </p>
                </div>
              </div>
            )}

            {/* Activity log */}
            <ActivityLog activities={agent.activities ?? []} />

            {/* Child agents */}
            <ChildAgentsSection children={agent.child_agents ?? []} />

            {/* Logs */}
            <LogsSection logs={agent.logs ?? []} />

            {/* Metadata */}
            <AgentMetadataSection agent={agent} />
          </div>
        </div>

        {/* Live indicator for active agents */}
        {isAgentActive(agent.status) && (
          <div className="px-4 py-2 border-t border-border bg-emerald-500/5 flex items-center gap-2 text-xs text-emerald-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live — auto-refreshing every 5 seconds
          </div>
        )}
      </div>

      {/* Stop/Kill confirmation dialog */}
      <StopKillDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, open }))
        }
        actionType={confirmDialog.action}
        agentName={agent.name}
        onConfirm={handleConfirm}
        loading={stopping || killing}
      />
    </>
  );
}
