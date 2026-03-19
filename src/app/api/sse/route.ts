import { NextRequest } from "next/server";

/**
 * GET /api/sse
 *
 * Server-Sent Events relay endpoint.
 * Proxies real-time events from the OpenClaw backend to the browser.
 *
 * The frontend passes connection details via headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 *
 * Query params:
 *   endpoint: (optional) the SSE endpoint path on the backend, default "/api/v1/events"
 *
 * The route opens a streaming connection to the backend, reads events,
 * and forwards them as standard SSE to the browser client.
 * On disconnect or error, appropriate SSE error events are sent before closing.
 */

// Disable Next.js body parsing and static optimization for streaming
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Known backend SSE endpoints to try, in order */
const SSE_ENDPOINTS = [
  "/api/v1/events",
  "/api/v1/stream",
  "/events",
  "/stream",
];

/** Maximum time (ms) to wait for the backend SSE connection to be established */
const CONNECT_TIMEOUT_MS = 15_000;

/** Interval (ms) for keep-alive comments sent to the browser */
const KEEPALIVE_INTERVAL_MS = 30_000;

/** Retry interval hint (ms) sent to the browser via SSE retry field */
const RETRY_MS = 5_000;

export async function GET(request: NextRequest) {
  const apiUrl = request.headers.get("x-openclaw-url") ||
    request.nextUrl.searchParams.get("apiUrl") ||
    process.env.OPENCLAW_API_URL ||
    "http://localhost:8000";

  const apiKey = request.headers.get("x-openclaw-key") ||
    request.nextUrl.searchParams.get("apiKey") ||
    "";

  const requestedEndpoint = request.nextUrl.searchParams.get("endpoint");

  // Normalize base URL
  let baseUrl: string;
  try {
    const parsed = new URL(apiUrl);
    baseUrl = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return sseErrorResponse("Invalid API URL format", 400);
  }

  // Build list of endpoints to try
  const endpointsToTry = requestedEndpoint
    ? [requestedEndpoint]
    : SSE_ENDPOINTS;

  // Build auth headers for the upstream request
  const upstreamHeaders: Record<string, string> = {
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
  if (apiKey) {
    upstreamHeaders["Authorization"] = `Bearer ${apiKey}`;
    upstreamHeaders["X-API-Key"] = apiKey;
  }

  // Try to connect to the backend SSE endpoint
  let upstreamResponse: Response | null = null;
  let connectedEndpoint = "";
  let lastError = "";

  for (const endpoint of endpointsToTry) {
    const url = `${baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: upstreamHeaders,
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);

      if (resp.ok && resp.body) {
        // Check if it's actually an SSE stream (content-type should contain text/event-stream)
        const contentType = resp.headers.get("content-type") || "";
        if (
          contentType.includes("text/event-stream") ||
          contentType.includes("application/json") || // some backends use JSON streaming
          contentType.includes("text/plain")
        ) {
          upstreamResponse = resp;
          connectedEndpoint = endpoint;
          break;
        }
        // If content-type doesn't match, try next endpoint
        lastError = `${endpoint}: unexpected content-type "${contentType}"`;
        continue;
      }

      if (resp.status === 401 || resp.status === 403) {
        return sseErrorResponse(
          `Authentication failed (HTTP ${resp.status}). Check your API key.`,
          401
        );
      }

      lastError = `${endpoint}: HTTP ${resp.status}`;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : "Unknown error";

      if (msg.includes("abort")) {
        lastError = "Connection timed out";
        break;
      }
      if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
        lastError = `Cannot reach ${baseUrl}: ${msg}`;
        break;
      }
      lastError = `${endpoint}: ${msg}`;
    }
  }

  if (!upstreamResponse || !upstreamResponse.body) {
    return sseErrorResponse(
      `Could not establish SSE connection to ${baseUrl}. ${lastError}`,
      502
    );
  }

  // We have a working upstream connection — now relay it as SSE to the browser
  const encoder = new TextEncoder();
  const upstreamBody = upstreamResponse.body;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(
          formatSSE("connected", {
            endpoint: connectedEndpoint,
            apiUrl: baseUrl,
            timestamp: new Date().toISOString(),
          })
        )
      );

      // Send retry hint
      controller.enqueue(encoder.encode(`retry: ${RETRY_MS}\n\n`));

      // Keep-alive timer
      const keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {
          clearInterval(keepAliveTimer);
        }
      }, KEEPALIVE_INTERVAL_MS);

      // Read from upstream and relay to client
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            // Upstream closed the connection
            controller.enqueue(
              encoder.encode(
                formatSSE("disconnected", {
                  reason: "upstream_closed",
                  timestamp: new Date().toISOString(),
                })
              )
            );
            break;
          }

          // Forward the raw SSE data from upstream
          const chunk = decoder.decode(value, { stream: true });

          // If upstream sends standard SSE format, forward as-is
          // If it sends raw JSON lines, wrap them as SSE events
          if (isSSEFormat(chunk)) {
            controller.enqueue(encoder.encode(chunk));
          } else {
            // Wrap non-SSE data as SSE events
            const lines = chunk.split("\n").filter((l) => l.trim());
            for (const line of lines) {
              try {
                // Try to parse as JSON to extract event type
                const parsed = JSON.parse(line);
                const eventType = parsed.type || parsed.event || "message";
                controller.enqueue(
                  encoder.encode(formatSSE(eventType, parsed))
                );
              } catch {
                // Not JSON, send as raw data
                controller.enqueue(
                  encoder.encode(`data: ${line}\n\n`)
                );
              }
            }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Stream error";
        try {
          controller.enqueue(
            encoder.encode(
              formatSSE("error", {
                message: msg,
                timestamp: new Date().toISOString(),
              })
            )
          );
        } catch {
          // Controller already closed
        }
      } finally {
        clearInterval(keepAliveTimer);
        try {
          reader.releaseLock();
        } catch {
          // Already released
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },

    cancel() {
      // Client disconnected — abort upstream
      try {
        upstreamBody.cancel();
      } catch {
        // Already cancelled
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Format data as an SSE event string.
 */
function formatSSE(event: string, data: unknown): string {
  const jsonStr = JSON.stringify(data);
  return `event: ${event}\ndata: ${jsonStr}\n\n`;
}

/**
 * Check if a chunk looks like standard SSE format (has "data:" or "event:" lines).
 */
function isSSEFormat(chunk: string): boolean {
  return /^(data:|event:|id:|retry:|:)/.test(chunk.trim());
}

/**
 * Return an SSE-formatted error response.
 * The response itself is SSE so the browser's EventSource gets the error event
 * before the stream closes.
 */
function sseErrorResponse(message: string, status: number): Response {
  const encoder = new TextEncoder();
  const body = encoder.encode(
    formatSSE("error", { message, timestamp: new Date().toISOString() }) +
    `retry: ${RETRY_MS}\n\n`
  );

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
