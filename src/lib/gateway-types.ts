/**
 * OpenClaw Gateway JSON-RPC WebSocket Frame Protocol Types.
 *
 * The gateway uses a JSON-RPC-style req/res/event frame protocol:
 * - "req"   → Client-to-server request with UUID id
 * - "res"   → Server-to-client response correlated by id
 * - "event" → Server-to-client push events (no id correlation)
 *
 * Auth flow:
 * 1. Client sends "device.auth" req with deviceId, publicKey, deviceToken
 * 2. Server responds with either:
 *    a. "challenge" status + challenge string + nonce (if no valid token)
 *    b. "authenticated" status + scopes (if token is valid)
 * 3. Client signs canonical payload: `${challenge}:${nonce}:${deviceId}`
 * 4. Client sends "device.auth.challenge" req with deviceId + signature
 * 5. Server responds with:
 *    a. "paired" status + deviceToken + scopes (if approved)
 *    b. "pending_pairing" status (if awaiting operator approval)
 *    c. "rejected" status (if denied)
 */

// ---------------------------------------------------------------------------
// JSON-RPC Frame Types
// ---------------------------------------------------------------------------

/** Base frame with discriminator */
export interface GatewayFrameBase {
  /** Frame type discriminator */
  type: "req" | "res" | "event";
}

/** Client-to-server request */
export interface GatewayRequest extends GatewayFrameBase {
  type: "req";
  /** Unique request ID (UUID v4) */
  id: string;
  /** Method name (e.g., "device.auth", "device.auth.challenge") */
  method: string;
  /** Request parameters */
  params: Record<string, unknown>;
}

/** Server-to-client response (correlated by id) */
export interface GatewayResponse extends GatewayFrameBase {
  type: "res";
  /** Correlated request ID */
  id: string;
  /** Whether the request succeeded */
  ok: boolean;
  /** Response payload (present when ok=true, e.g. hello-ok) */
  payload?: Record<string, unknown>;
  /** Response result data (legacy, present when ok=true) */
  result?: Record<string, unknown>;
  /** Error data (present when ok=false) */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Server-to-client push event */
export interface GatewayEvent {
  type: "event";
  /** Event name (e.g., "connect.challenge", "health.update") */
  event: string;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Alias for payload (legacy compat) */
  data: Record<string, unknown>;
  /** Server timestamp (ISO 8601) */
  timestamp?: string;
}

/** Union of all frame types */
export type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent;

// ---------------------------------------------------------------------------
// Auth Flow Types
// ---------------------------------------------------------------------------

/** Status values from device.auth response */
export type AuthStatus =
  | "challenge"
  | "authenticated"
  | "paired"
  | "pending_pairing"
  | "rejected"
  | "error";

/** Result from initial device.auth request */
export interface AuthChallengeResult {
  status: "challenge";
  challenge: string;
  nonce: string;
}

export interface AuthAuthenticatedResult {
  status: "authenticated";
  scopes: string[];
  deviceToken?: string;
}

/** Result from device.auth.challenge response */
export interface AuthPairedResult {
  status: "paired";
  deviceToken: string;
  scopes: string[];
}

export interface AuthPendingResult {
  status: "pending_pairing";
  message?: string;
}

export interface AuthRejectedResult {
  status: "rejected";
  reason?: string;
}

export type AuthResult =
  | AuthChallengeResult
  | AuthAuthenticatedResult
  | AuthPairedResult
  | AuthPendingResult
  | AuthRejectedResult;

// ---------------------------------------------------------------------------
// Gateway Connection State
// ---------------------------------------------------------------------------

export type GatewayAuthState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "challenge_signing"
  | "pending_pairing"
  | "authenticated"
  | "rejected"
  | "error";

export interface GatewayConnectionState {
  /** WebSocket-level connection state */
  wsState: "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";
  /** Auth-level state */
  authState: GatewayAuthState;
  /** Granted scopes after authentication */
  scopes: string[];
  /** Error message, if any */
  error: string | null;
  /** Last successful auth timestamp */
  lastAuthAt: number | null;
  /** Round-trip latency from last heartbeat */
  latencyMs: number | null;
}

// ---------------------------------------------------------------------------
// Pending Request Tracker
// ---------------------------------------------------------------------------

export interface PendingRequest {
  id: string;
  method: string;
  resolve: (res: GatewayResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  createdAt: number;
}
