/**
 * OpenClaw API Client
 * Handles communication with the OpenClaw REST API.
 * API URL is configurable via OPENCLAW_API_URL env var (server-side)
 * or stored in localStorage (client-side).
 * API key is stored in localStorage for client-side auth.
 */

export interface ConnectionConfig {
  apiUrl: string;
  apiKey: string;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  serverInfo?: {
    version?: string;
    [key: string]: unknown;
  };
}

const STORAGE_KEY_API_URL = "clawboard_api_url";
const STORAGE_KEY_API_KEY = "clawboard_api_key";

/** Default API URL from environment or fallback */
export function getDefaultApiUrl(): string {
  return process.env.NEXT_PUBLIC_OPENCLAW_API_URL || "http://localhost:8000";
}

/** Get stored connection config from localStorage */
export function getConnectionConfig(): ConnectionConfig {
  if (typeof window === "undefined") {
    return { apiUrl: getDefaultApiUrl(), apiKey: "" };
  }
  return {
    apiUrl: localStorage.getItem(STORAGE_KEY_API_URL) || getDefaultApiUrl(),
    apiKey: localStorage.getItem(STORAGE_KEY_API_KEY) || "",
  };
}

/** Save connection config to localStorage */
export function saveConnectionConfig(config: ConnectionConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_API_URL, config.apiUrl);
  localStorage.setItem(STORAGE_KEY_API_KEY, config.apiKey);
}

/** Clear stored connection config */
export function clearConnectionConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY_API_URL);
  localStorage.removeItem(STORAGE_KEY_API_KEY);
}

/**
 * Test connection to the OpenClaw API.
 * Makes a lightweight request to verify API URL and API key are valid.
 */
export async function testConnection(
  config: ConnectionConfig
): Promise<TestConnectionResult> {
  const { apiUrl, apiKey } = config;

  // Validate URL format
  try {
    new URL(apiUrl);
  } catch {
    return {
      success: false,
      message: "Invalid API URL format. Please enter a valid URL (e.g., http://localhost:8000).",
    };
  }

  // Validate API key is provided
  if (!apiKey.trim()) {
    return {
      success: false,
      message: "API key is required. Please enter your OpenClaw API key.",
    };
  }

  const startTime = performance.now();

  try {
    // Use the Next.js API route to proxy the test connection request
    // This avoids CORS issues when connecting to the OpenClaw API
    const response = await fetch("/api/health", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiUrl, apiKey }),
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const data = await response.json();

    if (data.ok) {
      return {
        success: true,
        message: data.message || `Connected successfully in ${latencyMs}ms`,
        latencyMs: data.latencyMs ?? latencyMs,
        serverInfo: data.serverInfo,
      };
    }

    return {
      success: false,
      message: data.error || `Connection failed (HTTP ${response.status})`,
      latencyMs: data.latencyMs ?? latencyMs,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("fetch") || errorMessage.includes("network")) {
      return {
        success: false,
        message: "Network error: Unable to reach the API proxy. Is the dashboard server running?",
        latencyMs,
      };
    }

    return {
      success: false,
      message: `Connection error: ${errorMessage}`,
      latencyMs,
    };
  }
}

/**
 * Generic API fetch wrapper for OpenClaw API requests.
 * Routes through the Next.js API proxy to avoid CORS issues.
 */
export async function openclawFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = getConnectionConfig();

  return fetch(`/api/proxy${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-OpenClaw-URL": config.apiUrl,
      "X-OpenClaw-Key": config.apiKey,
      ...options.headers,
    },
  });
}
