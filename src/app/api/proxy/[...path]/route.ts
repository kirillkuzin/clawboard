import { NextRequest, NextResponse } from "next/server";
import {
  getOpenClawConfig,
  filterResponseHeaders,
  getCorsOrigin,
} from "@/lib/api-config";

/**
 * Generic proxy route for OpenClaw API requests.
 * Routes: GET/POST/PUT/PATCH/DELETE /api/proxy/[...path]
 *
 * Reads target URL and API key from request headers:
 *   X-OpenClaw-URL: base URL of the OpenClaw instance
 *   X-OpenClaw-Key: API key for authentication
 *
 * Falls back to OPENCLAW_API_URL env var if no URL header is provided.
 */

function buildHeaders(apiKey: string, request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const contentType = request.headers.get("Content-Type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }

  return headers;
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const result = getOpenClawConfig(request);
  if (result.error) return result.error;

  const { baseUrl, apiKey } = result.config;

  // Validate path segments (no traversal)
  for (const segment of path) {
    if (segment === ".." || segment === ".") {
      return NextResponse.json(
        { error: "Invalid path" },
        { status: 400 }
      );
    }
  }

  const targetPath = "/" + path.join("/");

  // Forward query parameters
  const url = new URL(request.url);
  const queryString = url.searchParams.toString();
  const targetUrl = `${baseUrl}${targetPath}${queryString ? `?${queryString}` : ""}`;

  const headers = buildHeaders(apiKey, request);

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET requests
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // No body to forward
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    // Filter response headers using allowlist
    const responseHeaders = filterResponseHeaders(response.headers);

    // Set CORS to requesting origin (not wildcard)
    const origin = getCorsOrigin(request);
    if (origin) {
      responseHeaders.set("Access-Control-Allow-Origin", origin);
    }

    // Stream the response back instead of buffering
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request to OpenClaw API timed out after 30 seconds" },
        { status: 504 }
      );
    }

    if (message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { error: "Cannot reach OpenClaw API. Is the server running?" },
        { status: 502 }
      );
    }

    if (message.includes("ENOTFOUND")) {
      return NextResponse.json(
        { error: "Cannot resolve hostname for OpenClaw API. Check the API URL." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
