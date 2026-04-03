/**
 * JSON-RPC Message Serialization/Deserialization Utilities for OpenClaw Gateway.
 *
 * Provides standalone, reusable utilities for:
 * - UUID v4 generation (crypto.randomUUID with fallback)
 * - Request frame creation (serialization)
 * - Incoming frame parsing with type-safe discrimination (deserialization)
 * - Request-ID correlation tracking (pending request registry with timeouts)
 *
 * These utilities are used by GatewayClient but are also independently testable
 * and reusable for any code that needs to speak the OpenClaw JSON-RPC protocol.
 */

import type {
  GatewayFrame,
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  PendingRequest,
} from "../gateway-types";

// ---------------------------------------------------------------------------
// UUID v4 Generation
// ---------------------------------------------------------------------------

/**
 * Generate a UUID v4 string.
 *
 * Uses `crypto.randomUUID()` when available (modern browsers, Node 19+),
 * falls back to a Math.random()-based implementation for compatibility.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Frame Serialization (Client → Server)
// ---------------------------------------------------------------------------

/**
 * Create a JSON-RPC request frame ready to send over WebSocket.
 *
 * @param method - The RPC method name (e.g., "device.auth", "ping")
 * @param params - Request parameters
 * @param id - Optional custom request ID (auto-generated UUID if omitted)
 * @returns The GatewayRequest frame object
 */
export function createRequestFrame(
  method: string,
  params: Record<string, unknown> = {},
  id?: string
): GatewayRequest {
  return {
    type: "req",
    id: id ?? uuid(),
    method,
    params,
  };
}

/**
 * Serialize a GatewayRequest frame to a JSON string for sending over WebSocket.
 *
 * @param method - The RPC method name
 * @param params - Request parameters
 * @param id - Optional custom request ID
 * @returns Tuple of [requestId, jsonString] for correlation tracking
 */
export function serializeRequest(
  method: string,
  params: Record<string, unknown> = {},
  id?: string
): [id: string, json: string] {
  const frame = createRequestFrame(method, params, id);
  return [frame.id, JSON.stringify(frame)];
}

/**
 * Serialize any GatewayFrame to a JSON string.
 */
export function serializeFrame(frame: GatewayFrame): string {
  return JSON.stringify(frame);
}

// ---------------------------------------------------------------------------
// Frame Deserialization (Server → Client)
// ---------------------------------------------------------------------------

/** Result of parsing an incoming WebSocket message */
export type ParsedFrame =
  | { type: "response"; frame: GatewayResponse }
  | { type: "event"; frame: GatewayEvent }
  | { type: "request"; frame: GatewayRequest }
  | { type: "unknown"; raw: unknown }
  | { type: "error"; error: string };

/**
 * Parse and discriminate an incoming WebSocket message into a typed frame.
 *
 * Handles:
 * - Valid JSON with `type: "res"` → GatewayResponse
 * - Valid JSON with `type: "event"` → GatewayEvent
 * - Valid JSON with `frame: "req"` → GatewayRequest (server-initiated)
 * - Valid JSON with unknown/missing frame → unknown
 * - Invalid JSON → error
 *
 * @param data - Raw WebSocket message data (typically string)
 * @returns Discriminated ParsedFrame union
 */
export function parseFrame(data: string | ArrayBuffer | Blob): ParsedFrame {
  // Only handle string data for JSON-RPC protocol
  if (typeof data !== "string") {
    return { type: "error", error: "Non-string message data (binary not supported)" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { type: "error", error: `Invalid JSON: ${data.slice(0, 100)}` };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { type: "error", error: "Parsed value is not an object" };
  }

  const obj = parsed as Record<string, unknown>;
  const frameType = obj.type;

  switch (frameType) {
    case "res":
      return { type: "response", frame: parsed as GatewayResponse };

    case "event":
      return { type: "event", frame: parsed as GatewayEvent };

    case "req":
      return { type: "request", frame: parsed as GatewayRequest };

    default:
      return { type: "unknown", raw: parsed };
  }
}

/**
 * Type guard to check if a parsed frame is a response.
 */
export function isResponseFrame(parsed: ParsedFrame): parsed is { type: "response"; frame: GatewayResponse } {
  return parsed.type === "response";
}

/**
 * Type guard to check if a parsed frame is an event.
 */
export function isEventFrame(parsed: ParsedFrame): parsed is { type: "event"; frame: GatewayEvent } {
  return parsed.type === "event";
}

/**
 * Type guard to check if a parsed frame is a request.
 */
export function isRequestFrame(parsed: ParsedFrame): parsed is { type: "request"; frame: GatewayRequest } {
  return parsed.type === "request";
}

// ---------------------------------------------------------------------------
// Request-ID Correlation Tracker
// ---------------------------------------------------------------------------

/** Default request timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Manages pending JSON-RPC requests with UUID-correlated request/response tracking.
 *
 * Features:
 * - Register outgoing requests with auto-timeout
 * - Resolve/reject pending requests by matching response IDs
 * - Cancel all pending requests on disconnect
 * - Track pending request count for diagnostics
 *
 * @example
 * ```ts
 * const tracker = new RequestCorrelator();
 *
 * // Register a request and get a promise for the response
 * const { id, promise } = tracker.register("device.auth", 15000);
 *
 * // Send the request frame over WebSocket
 * ws.send(JSON.stringify(createRequestFrame("device.auth", params, id)));
 *
 * // When a response arrives, resolve it
 * tracker.resolve(response);
 *
 * // Await the correlated response
 * const result = await promise;
 * ```
 */
export class RequestCorrelator {
  private pending = new Map<string, PendingRequest>();

  /** Number of currently pending (in-flight) requests */
  get size(): number {
    return this.pending.size;
  }

  /** Check if a request ID is currently pending */
  has(id: string): boolean {
    return this.pending.has(id);
  }

  /**
   * Register a new outgoing request for response correlation.
   *
   * Returns a unique request ID and a Promise that resolves when the
   * correlated response arrives (or rejects on timeout).
   *
   * @param method - The RPC method name (for diagnostics)
   * @param timeoutMs - Timeout in milliseconds (default: 15000)
   * @param id - Optional pre-generated request ID (auto-generated if omitted)
   * @returns Object with `id` (the request ID) and `promise` (awaitable response)
   */
  register(
    method: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    id?: string
  ): { id: string; promise: Promise<GatewayResponse> } {
    const requestId = id ?? uuid();

    const promise = new Promise<GatewayResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request ${method} (${requestId}) timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(requestId, {
        id: requestId,
        method,
        resolve,
        reject,
        timer,
        createdAt: Date.now(),
      });
    });

    return { id: requestId, promise };
  }

  /**
   * Resolve a pending request by matching the response's ID.
   *
   * If the response ID matches a pending request, the request's promise is
   * resolved with the response and the timeout is cleared.
   *
   * @param response - The incoming GatewayResponse
   * @returns true if a pending request was found and resolved, false otherwise
   */
  resolve(response: GatewayResponse): boolean {
    const pending = this.pending.get(response.id);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    pending.resolve(response);
    return true;
  }

  /**
   * Reject a specific pending request by ID.
   *
   * @param id - The request ID to reject
   * @param reason - Error message for the rejection
   * @returns true if the request was found and rejected
   */
  reject(id: string, reason: string): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;

    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.reject(new Error(reason));
    return true;
  }

  /**
   * Cancel all pending requests (e.g., on connection close).
   *
   * Each pending request's promise is rejected with the given reason.
   *
   * @param reason - The rejection reason
   */
  cancelAll(reason: string): void {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    });
    this.pending.clear();
  }

  /**
   * Get diagnostic info about all pending requests.
   *
   * @returns Array of pending request summaries (id, method, age in ms)
   */
  getPendingInfo(): Array<{ id: string; method: string; ageMs: number }> {
    const now = Date.now();
    return Array.from(this.pending.values()).map((p) => ({
      id: p.id,
      method: p.method,
      ageMs: now - p.createdAt,
    }));
  }
}
