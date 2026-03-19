/**
 * Types for OpenClaw conversation and message data.
 */

export type MessageRole = "user" | "agent" | "system" | "tool";

export type ConversationStatus = "active" | "completed" | "error" | "archived";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string; // ISO 8601
  metadata?: {
    model?: string;
    tokens?: number;
    duration_ms?: number;
    tool_name?: string;
    tool_call_id?: string;
    agent_id?: string;
    agent_name?: string;
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  title: string;
  status: ConversationStatus;
  channel?: string;
  agent_id?: string;
  agent_name?: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
  message_count: number;
  messages?: Message[];
  metadata?: {
    user_id?: string;
    user_name?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface ConversationListResponse {
  conversations: Conversation[];
  total: number;
  page: number;
  page_size: number;
}

export interface ConversationDetailResponse extends Conversation {
  messages: Message[];
}
