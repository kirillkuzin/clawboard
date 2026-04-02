import { NextRequest, NextResponse } from "next/server";
import { getOpenClawConfig, buildAuthHeaders, sanitizePathParam, proxyErrorResponse } from "@/lib/api-config";

/**
 * GET /api/conversations/[id]
 *
 * Fetches a single conversation with its messages from the OpenClaw backend.
 *
 * Headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 */

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationDetail {
  id: string;
  agent_id?: string;
  agent_name?: string;
  channel?: string;
  status: "active" | "completed" | "failed" | "pending";
  created_at: string;
  updated_at?: string;
  messages: ConversationMessage[];
  metadata?: Record<string, unknown>;
  summary?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const safeId = sanitizePathParam(rawId);
  if (!safeId) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const result = getOpenClawConfig(request);
  if (result.error) return result.error;
  const { baseUrl, apiKey } = result.config;

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key is required. Configure it in Settings." },
      { status: 401 }
    );
  }

  const headers = buildAuthHeaders(apiKey);

  // Try multiple endpoint patterns
  const endpointsToTry = [
    `/api/v1/conversations/${safeId}`,
    `/api/conversations/${safeId}`,
    `/conversations/${safeId}`,
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    for (const endpoint of endpointsToTry) {
      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        if (response.ok) {
          clearTimeout(timeoutId);
          const data = await response.json();
          const normalized = normalizeConversationDetail(data);
          return NextResponse.json(normalized);
        }

        if (response.status === 401 || response.status === 403) {
          clearTimeout(timeoutId);
          return NextResponse.json(
            { error: `Authentication failed (HTTP ${response.status}). Check your API key.` },
            { status: response.status }
          );
        }

        if (response.status === 404) {
          // Could be wrong endpoint path or conversation not found
          // Try next endpoint first
          continue;
        }

        clearTimeout(timeoutId);
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          errorDetail = errBody.detail || errBody.message || errBody.error || errorDetail;
        } catch {
          // ignore
        }
        return NextResponse.json(
          { error: `OpenClaw API error: ${errorDetail}` },
          { status: response.status }
        );
      } catch (fetchError: unknown) {
        const msg = fetchError instanceof Error ? fetchError.message : "";
        if (msg.includes("abort") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
          throw fetchError;
        }
        continue;
      }
    }

    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: "Conversation not found." },
      { status: 404 }
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    return proxyErrorResponse(error, "Failed to fetch conversation");
  }
}

function normalizeConversationDetail(data: unknown): ConversationDetail {
  if (!data || typeof data !== "object") {
    return {
      id: "unknown",
      status: "pending",
      created_at: new Date().toISOString(),
      messages: [],
    };
  }

  const obj = data as Record<string, unknown>;

  // Extract messages from various possible field names
  const rawMessages = obj.messages || obj.history || obj.chat_history || [];
  const messages: ConversationMessage[] = Array.isArray(rawMessages)
    ? rawMessages.map(normalizeMessage)
    : [];

  return {
    id: String(obj.id || obj.conversation_id || obj.uuid || "unknown"),
    agent_id: obj.agent_id != null ? String(obj.agent_id) : undefined,
    agent_name: obj.agent_name != null ? String(obj.agent_name) : undefined,
    channel: obj.channel != null ? String(obj.channel) : undefined,
    status: normalizeStatus(obj.status),
    created_at: String(obj.created_at || obj.createdAt || obj.timestamp || new Date().toISOString()),
    updated_at: obj.updated_at || obj.updatedAt
      ? String(obj.updated_at || obj.updatedAt)
      : undefined,
    messages,
    metadata:
      typeof obj.metadata === "object" && obj.metadata !== null
        ? (obj.metadata as Record<string, unknown>)
        : undefined,
    summary: obj.summary != null ? String(obj.summary) : undefined,
  };
}

function normalizeMessage(item: unknown): ConversationMessage {
  if (!item || typeof item !== "object") {
    return {
      id: "unknown",
      role: "user",
      content: String(item || ""),
      timestamp: new Date().toISOString(),
    };
  }

  const obj = item as Record<string, unknown>;

  return {
    id: String(obj.id || obj.message_id || obj.uuid || Math.random().toString(36).slice(2)),
    role: normalizeRole(obj.role),
    content: String(obj.content || obj.text || obj.body || ""),
    timestamp: String(obj.timestamp || obj.created_at || obj.createdAt || new Date().toISOString()),
    metadata:
      typeof obj.metadata === "object" && obj.metadata !== null
        ? (obj.metadata as Record<string, unknown>)
        : undefined,
  };
}

function normalizeRole(role: unknown): ConversationMessage["role"] {
  const r = String(role || "").toLowerCase();
  if (r === "user" || r === "human") return "user";
  if (r === "assistant" || r === "ai" || r === "bot" || r === "agent") return "assistant";
  if (r === "system") return "system";
  if (r === "tool" || r === "function") return "tool";
  return "user";
}

function normalizeStatus(status: unknown): ConversationDetail["status"] {
  const s = String(status || "").toLowerCase();
  if (s === "active" || s === "running" || s === "in_progress") return "active";
  if (s === "completed" || s === "done" || s === "finished" || s === "success") return "completed";
  if (s === "failed" || s === "error" || s === "errored") return "failed";
  return "pending";
}
