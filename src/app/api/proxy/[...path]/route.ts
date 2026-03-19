import { NextRequest, NextResponse } from "next/server";

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

function getOpenClawConfig(request: NextRequest) {
  const apiUrl =
    request.headers.get("X-OpenClaw-URL") ||
    process.env.OPENCLAW_API_URL ||
    "http://localhost:8000";
  const apiKey = request.headers.get("X-OpenClaw-Key") || "";

  // Normalize - remove trailing slash
  const baseUrl = apiUrl.replace(/\/+$/, "");

  return { baseUrl, apiKey };
}

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
  const { baseUrl, apiKey } = getOpenClawConfig(request);
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

    // Stream the response back
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!["transfer-encoding", "connection", "keep-alive"].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });

    // Allow CORS from the dashboard
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    const responseBody = await response.arrayBuffer();

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("abort")) {
      return NextResponse.json(
        { error: "Request to OpenClaw API timed out after 30 seconds" },
        { status: 504 }
      );
    }

    if (message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { error: `Cannot reach OpenClaw API at ${baseUrl}. Is the server running?` },
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
