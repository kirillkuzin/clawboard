/**
 * OpenClaw Gateway WebSocket Client.
 *
 * Implements the official JSON-RPC req/res/event frame protocol with
 * Ed25519 device identity authentication (challenge-response signing).
 *
 * This is a standalone client for direct browser-to-gateway WS connections,
 * separate from the existing WebSocketManager (which connects to the
 * clawboard backend with simple { type, data } messages).
 *
 * Protocol:
 * - All frames are JSON with a "frame" discriminator: "req" | "res" | "event"
 * - Requests use UUID-correlated IDs for req/res matching
 * - Auth uses Ed25519 challenge-response via tweetnacl
 */

import type {
  GatewayRequest,
  GatewayResponse,
  GatewayEvent,
  GatewayConnectionState,
  GatewayAuthState,
  AuthChallengeResult,
  AuthResult,
} from "./gateway-types";

import {
  getOrCreateDeviceIdentity,
  signChallenge,
  updateDeviceToken,
  type DeviceIdentity,
} from "./device-identity";

import {
  uuid,
  createRequestFrame,
  parseFrame,
  isResponseFrame,
  isEventFrame,
  RequestCorrelator,
} from "./gateway/protocol";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 10_000;
const RECONNECT_MULTIPLIER = 1.5;
/** Set to 0 to disable auto-reconnect (manual connect only) */
const MAX_RECONNECT_ATTEMPTS = 0;

// ---------------------------------------------------------------------------
// Event handler types
// ---------------------------------------------------------------------------

export interface GatewayClientHandlers {
  /** Called when connection state changes */
  onStateChange?: (state: GatewayConnectionState) => void;
  /** Called for all incoming server events */
  onEvent?: (event: GatewayEvent) => void;
  /** Called on any error */
  onError?: (error: Error) => void;
  /** Called when auth completes successfully */
  onAuthenticated?: (scopes: string[]) => void;
  /** Called when pairing is pending (awaiting operator approval) */
  onPendingPairing?: () => void;
}

// ---------------------------------------------------------------------------
// GatewayClient
// ---------------------------------------------------------------------------

export class GatewayClient {
  private ws: WebSocket | null = null;
  private gatewayUrl: string;
  private handlers: GatewayClientHandlers = {};

  // Auth & identity
  private identity: DeviceIdentity | null = null;

  // Connection state
  private state: GatewayConnectionState = {
    wsState: "disconnected",
    authState: "disconnected",
    scopes: [],
    error: null,
    lastAuthAt: null,
    latencyMs: null,
  };

  // Pending request tracking (UUID-correlated req/res)
  private correlator = new RequestCorrelator();

  // Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPingSentAt: number | null = null;

  // Reconnect
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  private reconnectAttempts = 0;
  private intentionalClose = false;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Register event handlers */
  on(handlers: GatewayClientHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /** Get current connection state */
  getState(): GatewayConnectionState {
    return { ...this.state };
  }

  /** Get the current device identity */
  getIdentity(): DeviceIdentity | null {
    return this.identity;
  }

  /** Update gateway URL without connecting. Call connect() to use the new URL. */
  setGatewayUrl(url: string): void {
    this.gatewayUrl = url;
  }

  /** Connect to the gateway WebSocket */
  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;

    // Ensure we have a device identity
    this.identity = getOrCreateDeviceIdentity();

    this.updateWsState("connecting");

    const wsUrl = this.toWsUrl(this.gatewayUrl);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.state.error = error.message;
      this.updateWsState("disconnected");
      this.handlers.onError?.(error);
      return;
    }

    this.ws.onopen = () => {
      // NOTE: do NOT reset reconnectAttempts here — only reset after
      // successful authentication. Otherwise the counter resets on every
      // WS open, creating an infinite reconnect loop when the server
      // accepts the TCP connection but auth/protocol fails.
      this.state.error = null;
      this.updateWsState("connected");
      this.startHeartbeat();

      // Begin auth handshake
      this.startAuth();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();
      this.cancelAllPendingRequests("Connection closed");

      if (!this.intentionalClose) {
        this.state.error =
          event.reason || `Connection closed (code: ${event.code})`;
        // Only auto-reconnect if we were previously authenticated
        // (i.e. connection was lost mid-session). For initial connect
        // failures, just go to disconnected — user clicks Connect again.
        if (this.state.authState === "authenticated") {
          this.scheduleReconnect();
        } else {
          this.updateWsState("disconnected");
          this.updateAuthState("disconnected");
        }
      } else {
        this.updateWsState("disconnected");
        this.updateAuthState("disconnected");
      }
    };

    this.ws.onerror = () => {
      this.state.error = "WebSocket error occurred";
      this.handlers.onError?.(new Error("WebSocket error occurred"));
    };
  }

  /** Disconnect from the gateway */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.cancelAllPendingRequests("Client disconnected");

    if (this.ws) {
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, "Client disconnect");
      }
      this.ws = null;
    }

    this.reconnectAttempts = 0;
    this.reconnectDelay = RECONNECT_BASE_MS;
    this.updateWsState("disconnected");
    this.updateAuthState("disconnected");
  }

  /** Force reconnect */
  reconnect(): void {
    this.disconnect();
    this.intentionalClose = false;
    this.connect();
  }

  /** Send a JSON-RPC request and await the correlated response */
  async request(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = REQUEST_TIMEOUT_MS
  ): Promise<GatewayResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const { id, promise } = this.correlator.register(method, timeoutMs);
    const frame = createRequestFrame(method, params, id);

    try {
      this.ws.send(JSON.stringify(frame));
    } catch (err) {
      this.correlator.reject(id, "Failed to send request");
      throw err instanceof Error ? err : new Error("Failed to send request");
    }

    return promise;
  }

  /** Clean up all resources */
  destroy(): void {
    this.disconnect();
    this.handlers = {};
  }

  // -------------------------------------------------------------------------
  // Auth Handshake (Challenge-Response Signing Flow)
  // -------------------------------------------------------------------------

  /**
   * Step 1: Mark as waiting for server challenge.
   *
   * The OpenClaw gateway sends a `connect.challenge` event after the
   * WebSocket opens. We do NOT send anything proactively — just wait.
   */
  private startAuth(): void {
    if (!this.identity) {
      this.updateAuthState("error");
      this.state.error = "No device identity available";
      return;
    }
    this.updateAuthState("authenticating");
    // Now we wait for the server to send a "connect.challenge" event.
    // That event is handled in handleEvent() → handleConnectChallenge().
  }

  /**
   * Step 2: Handle the `connect.challenge` event from the server.
   *
   * Server sends: { frame: "event", type: "connect.challenge", data: { challenge, nonce } }
   *
   * Client signs `${challenge}:${nonce}:${deviceId}` and responds with
   * a `connect` request containing the signature + device identity.
   */
  private async handleConnectChallenge(
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.identity) {
      this.updateAuthState("error");
      this.state.error = "No device identity for challenge signing";
      return;
    }

    this.updateAuthState("challenge_signing");

    const challenge = data.challenge as string;
    const nonce = data.nonce as string;

    if (!challenge || !nonce) {
      this.updateAuthState("error");
      this.state.error = "Invalid connect.challenge: missing challenge or nonce";
      return;
    }

    // Construct canonical payload: challenge:nonce:deviceId
    const canonicalPayload = `${challenge}:${nonce}:${this.identity.deviceId}`;

    // Sign with Ed25519 secret key
    const signature = signChallenge(canonicalPayload, this.identity.secretKey);

    try {
      // Send "connect" request (NOT "device.auth" or "device.auth.challenge")
      const response = await this.request("connect", {
        deviceId: this.identity.deviceId,
        publicKey: this.identity.publicKey,
        deviceToken: this.identity.deviceToken || undefined,
        deviceLabel: this.identity.deviceLabel,
        signature,
        nonce,
      });

      if (!response.ok) {
        this.updateAuthState("error");
        this.state.error =
          response.error?.message || "Authentication rejected";
        this.handlers.onError?.(new Error(this.state.error));
        return;
      }

      const result = response.result as unknown as AuthResult;

      switch (result.status) {
        case "paired":
          // Pairing approved — store token and mark authenticated
          if (result.deviceToken) {
            updateDeviceToken(result.deviceToken);
            this.identity = {
              ...this.identity,
              deviceToken: result.deviceToken,
            };
          }
          this.state.scopes = result.scopes;
          this.state.lastAuthAt = Date.now();
          this.updateAuthState("authenticated");
          this.handlers.onAuthenticated?.(result.scopes);
          break;

        case "authenticated":
          this.state.scopes = result.scopes;
          this.state.lastAuthAt = Date.now();
          if (result.deviceToken) {
            updateDeviceToken(result.deviceToken);
          }
          this.updateAuthState("authenticated");
          this.handlers.onAuthenticated?.(result.scopes);
          break;

        case "pending_pairing":
          this.updateAuthState("pending_pairing");
          this.handlers.onPendingPairing?.();
          break;

        case "rejected":
          this.updateAuthState("rejected");
          this.state.error = result.reason || "Device pairing rejected";
          break;

        default:
          this.updateAuthState("error");
          this.state.error = `Unexpected auth result: ${(result as AuthResult).status}`;
          break;
      }
    } catch (err) {
      this.updateAuthState("error");
      this.state.error =
        err instanceof Error ? err.message : "Challenge signing failed";
      this.handlers.onError?.(
        err instanceof Error ? err : new Error(this.state.error)
      );
    }
  }

  // -------------------------------------------------------------------------
  // Message Handling
  // -------------------------------------------------------------------------

  private handleMessage(event: MessageEvent): void {
    const parsed = parseFrame(event.data as string);

    switch (parsed.type) {
      case "response":
        this.handleResponse(parsed.frame);
        break;

      case "event":
        this.handleEvent(parsed.frame);
        break;

      case "request":
        // Server-initiated request — not expected in normal flow
        break;

      case "unknown":
        // Handle legacy pong for heartbeat
        if (
          (parsed.raw as Record<string, unknown>)?.type === "pong" ||
          (parsed.raw as Record<string, unknown>)?.frame === "pong"
        ) {
          this.handlePong();
        }
        break;

      case "error":
        // Non-JSON or malformed message — ignore
        break;
    }
  }

  /** Handle a correlated response — resolve the pending request */
  private handleResponse(response: GatewayResponse): void {
    // Delegate to RequestCorrelator for UUID-based correlation
    this.correlator.resolve(response);
  }

  /** Handle a push event from the server */
  private handleEvent(event: GatewayEvent): void {
    // Server sends connect.challenge after WS opens — this starts the auth flow
    if (event.type === "connect.challenge") {
      this.handleConnectChallenge(event.data);
      return;
    }

    // Handle auth-related events (e.g., pairing approved while pending)
    if (event.type === "device.paired") {
      const data = event.data as {
        deviceToken?: string;
        scopes?: string[];
      };
      if (data.deviceToken && this.identity) {
        updateDeviceToken(data.deviceToken);
        this.identity = { ...this.identity, deviceToken: data.deviceToken };
      }
      if (data.scopes) {
        this.state.scopes = data.scopes;
      }
      this.state.lastAuthAt = Date.now();
      this.updateAuthState("authenticated");
      this.handlers.onAuthenticated?.(this.state.scopes);
    }

    // Forward all events to handler
    this.handlers.onEvent?.(event);
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingSentAt = Date.now();

        // Send ping as a JSON-RPC request using protocol utilities
        const pingFrame = createRequestFrame("ping", {
          timestamp: new Date().toISOString(),
        });

        try {
          this.ws.send(JSON.stringify(pingFrame));
        } catch {
          // ignore send errors
        }

        this.heartbeatTimeoutTimer = setTimeout(() => {
          this.state.error = "Heartbeat timeout";
          this.state.latencyMs = null;
          if (this.ws) {
            this.ws.close(4000, "Heartbeat timeout");
          }
        }, HEARTBEAT_TIMEOUT_MS);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    this.lastPingSentAt = null;
  }

  private handlePong(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
    if (this.lastPingSentAt) {
      this.state.latencyMs = Date.now() - this.lastPingSentAt;
      this.lastPingSentAt = null;
    }
  }

  // -------------------------------------------------------------------------
  // Reconnection
  // -------------------------------------------------------------------------

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.updateWsState("failed");
      this.updateAuthState("error");
      this.state.error = "Max reconnect attempts exceeded";
      return;
    }

    this.reconnectAttempts++;
    this.updateWsState("reconnecting");

    // Add jitter: ±25%
    const jitter = this.reconnectDelay * 0.25 * (Math.random() * 2 - 1);
    const delay = Math.round(this.reconnectDelay + jitter);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * RECONNECT_MULTIPLIER,
      RECONNECT_MAX_MS
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private cancelAllPendingRequests(reason: string): void {
    this.correlator.cancelAll(reason);
  }

  private updateWsState(
    wsState: GatewayConnectionState["wsState"]
  ): void {
    this.state.wsState = wsState;
    this.handlers.onStateChange?.({ ...this.state });
  }

  private updateAuthState(authState: GatewayAuthState): void {
    this.state.authState = authState;
    // Reset reconnect counter only on successful authentication —
    // this is the only point where we know the connection fully works.
    if (authState === "authenticated") {
      this.reconnectAttempts = 0;
      this.reconnectDelay = RECONNECT_BASE_MS;
    }
    this.handlers.onStateChange?.({ ...this.state });
  }

  private toWsUrl(urlStr: string): string {
    try {
      const url = new URL(urlStr);
      // If already ws/wss, use as-is
      if (url.protocol === "ws:" || url.protocol === "wss:") {
        return urlStr;
      }
      // Convert http(s) to ws(s)
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return url.toString();
    } catch {
      // Fallback: simple replacement
      return urlStr.replace(/^http/, "ws");
    }
  }
}
