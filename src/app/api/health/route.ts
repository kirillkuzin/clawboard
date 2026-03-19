import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/health
 * Proxies a test connection request to the OpenClaw API.
 * Tries multiple common health/status endpoints for compatibility.
 * Returns latency, server info, and detailed error messages.
 *
 * Body: { apiUrl: string, apiKey: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, apiKey } = body;

    if (!apiUrl) {
      return NextResponse.json(
        { ok: false, error: "API URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid API URL format. Please enter a valid URL (e.g., http://localhost:8000)." },
        { status: 400 }
      );
    }

    // Normalize URL - remove trailing slash
    const baseUrl = parsedUrl.origin + parsedUrl.pathname.replace(/\/+$/, "");

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-Key"] = apiKey;
    }

    // Try multiple endpoints for compatibility with different OpenClaw versions
    const endpointsToTry = [
      "/api/v1/health",
      "/health",
      "/api/v1/status",
      "/status",
      "/api/v1/info",
      "/",
    ];

    const startTime = Date.now();
    let lastError = "No endpoints responded successfully";

    for (const endpoint of endpointsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          let serverInfo: Record<string, unknown> = {};
          try {
            const data = await response.json();
            serverInfo = typeof data === "object" && data !== null ? data : { response: data };
          } catch {
            serverInfo = { status: "ok" };
          }

          return NextResponse.json({
            ok: true,
            message: `Connected to OpenClaw at ${baseUrl}`,
            latencyMs,
            endpoint,
            serverInfo,
          });
        }

        // 401/403 means the server is reachable but auth failed
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json({
            ok: false,
            error: `Authentication failed (HTTP ${response.status}). Please check your API key.`,
            latencyMs,
          });
        }

        lastError = `${endpoint} returned HTTP ${response.status}`;
      } catch (fetchError: unknown) {
        clearTimeout(timeoutId);
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : "Unknown error";

        if (errorMessage.includes("abort")) {
          lastError = "Connection timed out after 10 seconds";
          break; // Don't try more endpoints if we're timing out
        }

        lastError = errorMessage;

        // If it's a connection error, don't try more endpoints
        if (
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ENOTFOUND") ||
          errorMessage.includes("fetch failed") ||
          errorMessage.includes("EHOSTUNREACH") ||
          errorMessage.includes("EAI_AGAIN")
        ) {
          break;
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    // Provide clear error messages for common failures
    if (lastError.includes("ECONNREFUSED")) {
      return NextResponse.json({
        ok: false,
        error: `Cannot reach ${baseUrl}. Is the OpenClaw server running?`,
        latencyMs,
      });
    }

    if (lastError.includes("ENOTFOUND")) {
      return NextResponse.json({
        ok: false,
        error: `Cannot resolve hostname. Please check the API URL.`,
        latencyMs,
      });
    }

    if (lastError.includes("timed out")) {
      return NextResponse.json({
        ok: false,
        error: `Connection timed out after 10 seconds. The server may be unreachable.`,
        latencyMs,
      });
    }

    if (lastError.includes("fetch failed")) {
      return NextResponse.json({
        ok: false,
        error: `Cannot reach ${baseUrl}. Is the OpenClaw server running and accessible?`,
        latencyMs,
      });
    }

    return NextResponse.json({
      ok: false,
      error: `Could not connect to OpenClaw at ${baseUrl}. ${lastError}`,
      latencyMs,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
