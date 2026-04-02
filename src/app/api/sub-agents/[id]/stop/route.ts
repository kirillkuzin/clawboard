import { NextRequest, NextResponse } from "next/server";
import { getOpenClawConfig, buildAuthHeaders, sanitizePathParam, proxyErrorResponse } from "@/lib/api-config";

/**
 * POST /api/sub-agents/[id]/stop
 *
 * Sends a stop or kill action to a specific sub-agent via the OpenClaw API.
 * Proxies the request through the Next.js server to avoid CORS issues.
 *
 * Body (optional):
 *   - action: "stop" | "kill" (default: "stop")
 *   - reason: optional string describing why the agent is being stopped
 *
 * Headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = sanitizePathParam(rawId);
  if (!id) {
    return NextResponse.json({ error: "Invalid sub-agent ID" }, { status: 400 });
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

  if (!id) {
    return NextResponse.json(
      { error: "Sub-agent ID is required." },
      { status: 400 }
    );
  }

  // Parse body
  let action: "stop" | "kill" = "stop";
  let reason: string | undefined;

  try {
    const body = await request.json();
    if (body.action === "kill") {
      action = "kill";
    }
    if (typeof body.reason === "string") {
      reason = body.reason;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  const headers = buildAuthHeaders(apiKey);
  headers["Content-Type"] = "application/json";

  const requestBody = JSON.stringify({
    action,
    ...(reason ? { reason } : {}),
  });

  // Try multiple endpoint patterns for compatibility with different OpenClaw versions
  // Some APIs use POST /sub-agents/:id/stop, others use POST /sub-agents/:id/kill,
  // and some use a generic action endpoint
  const endpointsToTry = action === "kill"
    ? [
        { url: `/api/v1/sub-agents/${id}/kill`, method: "POST" as const },
        { url: `/api/v1/subagents/${id}/kill`, method: "POST" as const },
        { url: `/api/v1/sub-agents/${id}/stop`, method: "POST" as const, bodyOverride: { action: "kill", reason } },
        { url: `/api/v1/subagents/${id}/stop`, method: "POST" as const, bodyOverride: { action: "kill", reason } },
        { url: `/api/sub-agents/${id}/kill`, method: "POST" as const },
        { url: `/api/subagents/${id}/kill`, method: "POST" as const },
        { url: `/api/v1/agents/sub/${id}/kill`, method: "POST" as const },
        { url: `/sub-agents/${id}/kill`, method: "POST" as const },
      ]
    : [
        { url: `/api/v1/sub-agents/${id}/stop`, method: "POST" as const },
        { url: `/api/v1/subagents/${id}/stop`, method: "POST" as const },
        { url: `/api/sub-agents/${id}/stop`, method: "POST" as const },
        { url: `/api/subagents/${id}/stop`, method: "POST" as const },
        { url: `/api/v1/agents/sub/${id}/stop`, method: "POST" as const },
        { url: `/sub-agents/${id}/stop`, method: "POST" as const },
      ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    for (const endpoint of endpointsToTry) {
      try {
        const body = endpoint.bodyOverride
          ? JSON.stringify(endpoint.bodyOverride)
          : requestBody;

        const response = await fetch(`${baseUrl}${endpoint.url}`, {
          method: endpoint.method,
          headers,
          body,
          signal: controller.signal,
        });

        if (response.ok) {
          clearTimeout(timeoutId);
          let responseData: Record<string, unknown> = {};
          try {
            responseData = await response.json();
          } catch {
            responseData = { ok: true };
          }

          return NextResponse.json({
            ok: true,
            message: `Sub-agent ${id} ${action === "kill" ? "killed" : "stopped"} successfully`,
            action,
            agent_id: id,
            ...responseData,
          });
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

        // 409 Conflict — agent may already be stopped
        if (response.status === 409) {
          clearTimeout(timeoutId);
          let detail = "Agent may already be stopped";
          try {
            const errBody = await response.json();
            detail = errBody.detail || errBody.message || errBody.error || detail;
          } catch {
            // ignore
          }
          return NextResponse.json(
            { error: detail, agent_id: id },
            { status: 409 }
          );
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
        error: `Sub-agent ${action} endpoint not found. The OpenClaw instance may not support this feature or uses a different API version.`,
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

    return proxyErrorResponse(error, `Failed to ${action} sub-agent`);
  }
}
