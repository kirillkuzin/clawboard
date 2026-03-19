/**
 * Shared types for OpenClaw resources.
 */

// ── Skills ──────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  type?: string;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface SkillFormData {
  name: string;
  description?: string;
  enabled?: boolean;
  type?: string;
  config?: Record<string, unknown>;
}

export const SKILL_TYPES = [
  "function",
  "api",
  "prompt",
  "chain",
  "retrieval",
  "custom",
] as const;

// ── Model Providers ─────────────────────────────────────

export interface Provider {
  id: string;
  name: string;
  type?: string;
  api_key?: string;
  base_url?: string;
  enabled?: boolean;
  models?: string[];
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ProviderFormData {
  name: string;
  type?: string;
  api_key?: string;
  base_url?: string;
  enabled?: boolean;
  models?: string[];
  config?: Record<string, unknown>;
}

export const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "google",
  "azure",
  "ollama",
  "huggingface",
  "custom",
] as const;

// ── Channels ────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChannelFormData {
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description?: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  method: string;
  enabled: boolean;
  events: string[];
  headers: Record<string, string>;
  secret?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface WebhookFormData {
  name: string;
  url: string;
  method: string;
  enabled: boolean;
  events: string[];
  headers: Record<string, string>;
  secret?: string;
  description?: string;
}

export interface ApiError {
  error: string;
  detail?: string;
  status?: number;
}

export const CHANNEL_TYPES = [
  "slack",
  "discord",
  "telegram",
  "teams",
  "email",
  "websocket",
  "http",
  "custom",
] as const;

export const WEBHOOK_METHODS = ["POST", "GET", "PUT", "PATCH"] as const;

export const WEBHOOK_EVENTS = [
  "message.created",
  "message.updated",
  "conversation.started",
  "conversation.ended",
  "agent.started",
  "agent.completed",
  "agent.error",
  "skill.executed",
  "system.health",
  "custom",
] as const;

// ── Plugins ────────────────────────────────────────────

export interface Plugin {
  id: string;
  name: string;
  description?: string;
  version?: string;
  enabled: boolean;
  type?: string;
  entry_point?: string;
  config?: Record<string, unknown>;
  dependencies?: string[];
  author?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface PluginFormData {
  name: string;
  description?: string;
  version?: string;
  enabled: boolean;
  type?: string;
  entry_point?: string;
  config?: Record<string, unknown>;
  dependencies?: string[];
  author?: string;
}

export const PLUGIN_TYPES = [
  "builtin",
  "community",
  "custom",
  "integration",
  "middleware",
  "extension",
] as const;

// ── Cron Jobs ──────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  command?: string;
  skill_id?: string;
  description?: string;
  timezone?: string;
  last_run?: string;
  next_run?: string;
  status?: string;
  max_retries?: number;
  timeout?: number;
  config?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CronJobFormData {
  name: string;
  schedule: string;
  enabled: boolean;
  command?: string;
  skill_id?: string;
  description?: string;
  timezone?: string;
  max_retries?: number;
  timeout?: number;
  config?: Record<string, unknown>;
}

export const CRON_PRESETS = [
  { value: "* * * * *", label: "Every minute" },
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "*/30 * * * *", label: "Every 30 minutes" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 */12 * * *", label: "Every 12 hours" },
  { value: "0 0 * * *", label: "Daily at midnight" },
  { value: "0 0 * * 1", label: "Weekly on Monday" },
  { value: "0 0 1 * *", label: "Monthly on 1st" },
] as const;

// ── Sub-Agents ─────────────────────────────────────────

export type SubAgentStatus = "running" | "idle" | "completed" | "error" | "waiting" | "stopped";

export interface SubAgent {
  id: string;
  name: string;
  status: SubAgentStatus;
  parent_conversation_id?: string;
  parent_conversation_title?: string;
  agent_type?: string;
  current_task?: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SubAgentListResponse {
  agents: SubAgent[];
  total: number;
}

export const SUB_AGENT_STATUSES: SubAgentStatus[] = [
  "running",
  "idle",
  "completed",
  "error",
  "waiting",
  "stopped",
];

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
] as const;
