/**
 * Shared server-side API configuration for OpenClaw proxy routes.
 *
 * Validates and normalizes the target URL to prevent SSRF attacks.
 * Only allows http/https protocols and validates URL format.
 */

import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PROTOCOLS = ["http:", "https:"];

export interface OpenClawConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Extract and validate OpenClaw connection config from a request.
 * Returns null with an error response if validation fails.
 */
export function getOpenClawConfig(
  request: NextRequest
): { config: OpenClawConfig; error?: never } | { config?: never; error: NextResponse } {
  const apiUrl =
    request.headers.get("X-OpenClaw-URL") ||
    process.env.OPENCLAW_API_URL ||
    "http://localhost:8000";
  const apiKey = request.headers.get("X-OpenClaw-Key") || "";

  // Validate URL format and protocol
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    return {
      error: NextResponse.json(
        { error: "Invalid API URL format" },
        { status: 400 }
      ),
    };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      error: NextResponse.json(
        { error: `Unsupported protocol: ${parsed.protocol}. Only http and https are allowed.` },
        { status: 400 }
      ),
    };
  }

  // Block requests to common metadata/internal endpoints
  const hostname = parsed.hostname;
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".internal") && hostname !== "localhost"
  ) {
    return {
      error: NextResponse.json(
        { error: "Access to internal metadata services is not allowed" },
        { status: 403 }
      ),
    };
  }

  const baseUrl = parsed.origin + parsed.pathname.replace(/\/+$/, "");

  return { config: { baseUrl, apiKey } };
}

/**
 * Build standard auth headers for upstream OpenClaw requests.
 */
export function buildAuthHeaders(
  apiKey: string,
  accept: string = "application/json"
): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

/**
 * CORS headers scoped to same-origin (not wildcard).
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "",  // Will be set per-request
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-OpenClaw-URL, X-OpenClaw-Key",
} as const;

/**
 * Get the origin from the request for CORS, falling back to empty string.
 */
export function getCorsOrigin(request: NextRequest): string {
  return request.headers.get("Origin") || "";
}

/**
 * Standard error response formatting for proxy errors.
 * Avoids leaking internal URLs in error messages.
 */
export function proxyErrorResponse(error: unknown, context: string): NextResponse {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (error instanceof Error && error.name === "AbortError") {
    return NextResponse.json(
      { error: `Request to OpenClaw API timed out` },
      { status: 504 }
    );
  }

  if (message.includes("ECONNREFUSED")) {
    return NextResponse.json(
      { error: `Cannot reach OpenClaw API. Is the server running?` },
      { status: 502 }
    );
  }

  if (message.includes("ENOTFOUND")) {
    return NextResponse.json(
      { error: "Cannot resolve OpenClaw hostname. Check the API URL." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { error: `${context}: ${message}` },
    { status: 502 }
  );
}

/** Safe response header allowlist for proxy forwarding */
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
  "content-disposition",
  "cache-control",
  "etag",
  "last-modified",
  "vary",
  "x-request-id",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
]);

/**
 * Filter upstream response headers to only safe headers (allowlist approach).
 */
export function filterResponseHeaders(upstream: Headers): Headers {
  const filtered = new Headers();
  upstream.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) {
      filtered.set(key, value);
    }
  });
  return filtered;
}

/**
 * Sanitize a path parameter (e.g., conversation ID) to prevent path traversal.
 */
export function sanitizePathParam(param: string): string | null {
  if (!param || param.includes("..") || param.includes("/") || param.includes("\\")) {
    return null;
  }
  return encodeURIComponent(param);
}
