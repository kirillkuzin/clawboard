/**
 * Normalized event types for real-time OpenClaw agent activity.
 * These types represent the canonical shape of events consumed
 * by dashboard components, regardless of the underlying API format.
 */

// ── Agent Status ──────────────────────────────────────────────

export type AgentStatus = "idle" | "busy" | "error" | "offline" | "starting";

export interface AgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  /** Current task description, if busy */
  currentTask?: string;
  /** Timestamp of last status change */
  lastSeen: number;
  /** Additional metadata from the API */
  metadata?: Record<string, unknown>;
}

// ── Conversations ─────────────────────────────────────────────

export interface ConversationInfo {
  id: string;
  agentId: string;
  channelId?: string;
  status: "active" | "completed" | "failed";
  messageCount: number;
  startedAt: number;
  lastMessageAt: number;
  summary?: string;
}

// ── Sub-Agents ────────────────────────────────────────────────

export interface SubAgentInfo {
  id: string;
  parentAgentId: string;
  name: string;
  status: AgentStatus;
  task?: string;
  createdAt: number;
  lastSeen: number;
}

// ── Resource Summaries (for sidebar badges, etc.) ────────────

export interface ResourceCounts {
  skills: number;
  providers: number;
  channels: number;
  webhooks: number;
  plugins: number;
  crons: number;
}

// ── Normalized Activity Events ────────────────────────────────

export type ActivityEventType =
  | "agent_status_change"
  | "conversation_started"
  | "conversation_message"
  | "conversation_ended"
  | "subagent_spawned"
  | "subagent_completed"
  | "cron_triggered"
  | "webhook_received"
  | "error"
  | "system";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: number;
  agentId?: string;
  summary: string;
  details?: Record<string, unknown>;
}

// ── Connection State ──────────────────────────────────────────

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface ConnectionState {
  status: ConnectionStatus;
  lastConnected: number | null;
  lastError: string | null;
  reconnectAttempt: number;
  latencyMs: number | null;
}

// ── Aggregate Real-Time State ─────────────────────────────────

export interface RealtimeState {
  connection: ConnectionState;
  agents: AgentInfo[];
  conversations: ConversationInfo[];
  subAgents: SubAgentInfo[];
  resourceCounts: ResourceCounts;
  /** Rolling buffer of recent activity events (newest first) */
  recentEvents: ActivityEvent[];
}
