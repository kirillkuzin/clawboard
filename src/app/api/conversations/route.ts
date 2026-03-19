import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/conversations
 *
 * Fetches conversation history from the OpenClaw framework backend.
 * Proxies the request through the Next.js server to avoid CORS issues.
 *
 * Query params (forwarded to OpenClaw):
 *   - limit:  number of conversations to return (default: 50)
 *   - offset: pagination offset (default: 0)
 *   - status: filter by status (active, completed, failed)
 *   - agent_id: filter by agent ID
 *   - search: search query string
 *
 * Headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 */

/** Shape of a single conversation from OpenClaw API */
export interface Conversation {
  id: string;
  agent_id?: string;
  agent_name?: string;
  channel?: string;
  status: "active" | "completed" | "failed" | "pending";
  created_at: string;
  updated_at?: string;
  message_count?: number;
  metadata?: Record<string, unknown>;
  summary?: string;
  last_message?: string;
}

/** Shape of the conversations list response */
export interface ConversationsResponse {
  conversations: Conversation[];
  total: number;
  limit: number;
  offset: number;
}

function getOpenClawConfig(request: NextRequest) {
  const apiUrl =
    request.headers.get("X-OpenClaw-URL") ||
    process.env.OPENCLAW_API_URL ||
    "http://localhost:8000";
  const apiKey = request.headers.get("X-OpenClaw-Key") || "";

  return {
    baseUrl: apiUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

export async function GET(request: NextRequest) {
  const { baseUrl, apiKey } = getOpenClawConfig(request);

  if (!apiKey) {
    return NextResponse.json(
      { error: "API key is required. Configure it in Settings." },
      { status: 401 }
    );
  }

  // Forward query parameters
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") || "50";
  const offset = searchParams.get("offset") || "0";
  const status = searchParams.get("status");
  const agentId = searchParams.get("agent_id");
  const search = searchParams.get("search");

  // Build query string for OpenClaw API
  const params = new URLSearchParams({ limit, offset });
  if (status) params.set("status", status);
  if (agentId) params.set("agent_id", agentId);
  if (search) params.set("search", search);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
  };

  // Try multiple conversation endpoint patterns for OpenClaw compatibility
  const endpointsToTry = [
    `/api/v1/conversations?${params}`,
    `/api/conversations?${params}`,
    `/conversations?${params}`,
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

          // Normalize the response shape — OpenClaw may return different formats
          const normalized = normalizeConversationsResponse(data, limit, offset);
          return NextResponse.json(normalized);
        }

        // Auth errors — return immediately, don't try other endpoints
        if (response.status === 401 || response.status === 403) {
          clearTimeout(timeoutId);
          return NextResponse.json(
            { error: `Authentication failed (HTTP ${response.status}). Check your API key.` },
            { status: response.status }
          );
        }

        // 404 — try next endpoint
        if (response.status === 404) {
          continue;
        }

        // Other errors — return with details
        clearTimeout(timeoutId);
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          errorDetail = errBody.detail || errBody.message || errBody.error || errorDetail;
        } catch {
          // ignore parse errors
        }
        return NextResponse.json(
          { error: `OpenClaw API error: ${errorDetail}` },
          { status: response.status }
        );
      } catch (fetchError: unknown) {
        const msg = fetchError instanceof Error ? fetchError.message : "";
        // If abort or connection error, stop trying
        if (msg.includes("abort") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
          throw fetchError;
        }
        // Otherwise try next endpoint
        continue;
      }
    }

    clearTimeout(timeoutId);

    // None of the endpoints worked (all 404)
    return NextResponse.json(
      {
        error: "Conversations endpoint not found. The OpenClaw instance may not support this feature or uses a different API version.",
      },
      { status: 404 }
    );
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("abort")) {
      return NextResponse.json(
        { error: "Request to OpenClaw API timed out" },
        { status: 504 }
      );
    }

    if (message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { error: `Cannot reach OpenClaw at ${baseUrl}. Is the server running?` },
        { status: 502 }
      );
    }

    if (message.includes("ENOTFOUND")) {
      return NextResponse.json(
        { error: "Cannot resolve OpenClaw hostname. Check the API URL in Settings." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: `Failed to fetch conversations: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Normalize various OpenClaw response formats into a consistent shape.
 * OpenClaw may return:
 *   - { conversations: [...], total: N }
 *   - { data: [...], total: N }
 *   - { items: [...], count: N }
 *   - [...] (plain array)
 */
function normalizeConversationsResponse(
  data: unknown,
  limit: string,
  offset: string
): ConversationsResponse {
  let conversations: Conversation[] = [];
  let total = 0;

  if (Array.isArray(data)) {
    conversations = data.map(normalizeConversation);
    total = data.length;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const items = obj.conversations || obj.data || obj.items || obj.results || [];

    if (Array.isArray(items)) {
      conversations = items.map(normalizeConversation);
    }

    total =
      typeof obj.total === "number"
        ? obj.total
        : typeof obj.count === "number"
          ? obj.count
          : conversations.length;
  }

  return {
    conversations,
    total,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  };
}

/**
 * Normalize a single conversation object to ensure consistent field names.
 */
function normalizeConversation(item: unknown): Conversation {
  if (!item || typeof item !== "object") {
    return {
      id: "unknown",
      status: "pending",
      created_at: new Date().toISOString(),
    };
  }

  const obj = item as Record<string, unknown>;

  return {
    id: String(obj.id || obj.conversation_id || obj.uuid || "unknown"),
    agent_id: obj.agent_id != null ? String(obj.agent_id) : undefined,
    agent_name: obj.agent_name != null ? String(obj.agent_name) : undefined,
    channel: obj.channel != null ? String(obj.channel) : undefined,
    status: normalizeStatus(obj.status),
    created_at: String(obj.created_at || obj.createdAt || obj.timestamp || new Date().toISOString()),
    updated_at: obj.updated_at || obj.updatedAt ? String(obj.updated_at || obj.updatedAt) : undefined,
    message_count:
      typeof obj.message_count === "number"
        ? obj.message_count
        : typeof obj.messages === "number"
          ? obj.messages
          : undefined,
    metadata: typeof obj.metadata === "object" && obj.metadata !== null
      ? (obj.metadata as Record<string, unknown>)
      : undefined,
    summary: obj.summary != null ? String(obj.summary) : undefined,
    last_message: obj.last_message != null
      ? String(obj.last_message)
      : obj.lastMessage != null
        ? String(obj.lastMessage)
        : undefined,
  };
}

function normalizeStatus(status: unknown): Conversation["status"] {
  const s = String(status || "").toLowerCase();
  if (s === "active" || s === "running" || s === "in_progress") return "active";
  if (s === "completed" || s === "done" || s === "finished" || s === "success") return "completed";
  if (s === "failed" || s === "error" || s === "errored") return "failed";
  return "pending";
}
