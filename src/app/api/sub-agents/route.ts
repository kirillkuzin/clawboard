import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sub-agents
 *
 * Fetches sub-agent activity data from the OpenClaw framework backend.
 * Proxies the request through the Next.js server to avoid CORS issues.
 *
 * Query params (forwarded to OpenClaw):
 *   - limit:  number of sub-agents to return (default: 50)
 *   - offset: pagination offset (default: 0)
 *   - status: filter by status (running, idle, stopped, error)
 *   - parent_id: filter by parent agent ID
 *
 * Headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 */

/** Shape of a single sub-agent from OpenClaw API */
export interface SubAgent {
  id: string;
  name: string;
  parent_id?: string;
  parent_name?: string;
  status: "running" | "idle" | "stopped" | "error" | "starting";
  type?: string;
  task?: string;
  model?: string;
  started_at?: string;
  updated_at?: string;
  stopped_at?: string;
  uptime_seconds?: number;
  message_count?: number;
  token_usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  metadata?: Record<string, unknown>;
}

/** Shape of the sub-agents list response */
export interface SubAgentsResponse {
  sub_agents: SubAgent[];
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
  const parentId = searchParams.get("parent_id");

  // Build query string for OpenClaw API
  const params = new URLSearchParams({ limit, offset });
  if (status) params.set("status", status);
  if (parentId) params.set("parent_id", parentId);

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-API-Key": apiKey,
  };

  // Try multiple sub-agent endpoint patterns for OpenClaw compatibility
  const endpointsToTry = [
    `/api/v1/sub-agents?${params}`,
    `/api/v1/subagents?${params}`,
    `/api/v1/agents/sub?${params}`,
    `/api/sub-agents?${params}`,
    `/api/subagents?${params}`,
    `/sub-agents?${params}`,
    `/subagents?${params}`,
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
          const normalized = normalizeSubAgentsResponse(data, limit, offset);
          return NextResponse.json(normalized);
        }

        // Auth errors — return immediately
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
        if (msg.includes("abort") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND")) {
          throw fetchError;
        }
        continue;
      }
    }

    clearTimeout(timeoutId);

    return NextResponse.json(
      {
        error: "Sub-agents endpoint not found. The OpenClaw instance may not support this feature or uses a different API version.",
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
      { error: `Failed to fetch sub-agents: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Normalize various OpenClaw response formats into a consistent shape.
 */
function normalizeSubAgentsResponse(
  data: unknown,
  limit: string,
  offset: string
): SubAgentsResponse {
  let subAgents: SubAgent[] = [];
  let total = 0;

  if (Array.isArray(data)) {
    subAgents = data.map(normalizeSubAgent);
    total = data.length;
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const items =
      obj.sub_agents || obj.subagents || obj.agents || obj.data || obj.items || obj.results || [];

    if (Array.isArray(items)) {
      subAgents = items.map(normalizeSubAgent);
    }

    total =
      typeof obj.total === "number"
        ? obj.total
        : typeof obj.count === "number"
          ? obj.count
          : subAgents.length;
  }

  return {
    sub_agents: subAgents,
    total,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
  };
}

/**
 * Normalize a single sub-agent object to ensure consistent field names.
 */
function normalizeSubAgent(item: unknown): SubAgent {
  if (!item || typeof item !== "object") {
    return {
      id: "unknown",
      name: "Unknown Agent",
      status: "idle",
    };
  }

  const obj = item as Record<string, unknown>;

  return {
    id: String(obj.id || obj.agent_id || obj.uuid || "unknown"),
    name: String(obj.name || obj.agent_name || obj.label || "Unnamed Agent"),
    parent_id: obj.parent_id != null ? String(obj.parent_id) : undefined,
    parent_name: obj.parent_name != null ? String(obj.parent_name) : undefined,
    status: normalizeStatus(obj.status),
    type: obj.type != null ? String(obj.type) : undefined,
    task: obj.task != null
      ? String(obj.task)
      : obj.current_task != null
        ? String(obj.current_task)
        : obj.description != null
          ? String(obj.description)
          : undefined,
    model: obj.model != null ? String(obj.model) : undefined,
    started_at: obj.started_at || obj.created_at || obj.startedAt
      ? String(obj.started_at || obj.created_at || obj.startedAt)
      : undefined,
    updated_at: obj.updated_at || obj.updatedAt
      ? String(obj.updated_at || obj.updatedAt)
      : undefined,
    stopped_at: obj.stopped_at || obj.stoppedAt
      ? String(obj.stopped_at || obj.stoppedAt)
      : undefined,
    uptime_seconds:
      typeof obj.uptime_seconds === "number"
        ? obj.uptime_seconds
        : typeof obj.uptime === "number"
          ? obj.uptime
          : undefined,
    message_count:
      typeof obj.message_count === "number"
        ? obj.message_count
        : typeof obj.messages === "number"
          ? obj.messages
          : undefined,
    token_usage: normalizeTokenUsage(obj.token_usage || obj.tokens || obj.usage),
    metadata:
      typeof obj.metadata === "object" && obj.metadata !== null
        ? (obj.metadata as Record<string, unknown>)
        : undefined,
  };
}

function normalizeStatus(status: unknown): SubAgent["status"] {
  const s = String(status || "").toLowerCase();
  if (s === "running" || s === "active" || s === "busy" || s === "processing" || s === "in_progress") return "running";
  if (s === "idle" || s === "waiting" || s === "ready") return "idle";
  if (s === "stopped" || s === "terminated" || s === "killed" || s === "completed" || s === "done") return "stopped";
  if (s === "error" || s === "failed" || s === "errored" || s === "crashed") return "error";
  if (s === "starting" || s === "initializing" || s === "pending") return "starting";
  return "idle";
}

function normalizeTokenUsage(
  usage: unknown
): SubAgent["token_usage"] | undefined {
  if (!usage || typeof usage !== "object") return undefined;

  const obj = usage as Record<string, unknown>;
  const promptTokens =
    typeof obj.prompt_tokens === "number" ? obj.prompt_tokens : undefined;
  const completionTokens =
    typeof obj.completion_tokens === "number" ? obj.completion_tokens : undefined;
  const totalTokens =
    typeof obj.total_tokens === "number"
      ? obj.total_tokens
      : typeof obj.total === "number"
        ? obj.total
        : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}
