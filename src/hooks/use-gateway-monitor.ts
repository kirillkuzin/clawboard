"use client";

/**
 * useGatewayMonitor – React hook for the OpenClaw Gateway JSON-RPC WebSocket
 * connection with Ed25519 device identity auth.
 *
 * Wraps the GatewayClient class, exposing:
 * - Connection + auth state as React state (wsState, authState, readyState)
 * - A promise-based `sendRequest(method, params)` method that uses the
 *   GatewayClient's UUID-correlated req/res pattern (pending request map,
 *   timeout handling)
 * - Push event subscription via addEventListener/removeEventListener
 * - Typed event dispatch: incoming "event" frames automatically update
 *   per-widget React state (alerts, systemHealth, costTracking, etc.)
 * - Auto-connect on mount when gatewayWsUrl is configured
 * - Auto-reconnect with exponential backoff handled by GatewayClient
 * - Manual connect/disconnect/reconnect controls
 * - 30-second polling for cost/usage data with manual Refresh button
 * - Device identity tracking (publicKey, deviceId, deviceToken)
 * - Latency tracking from heartbeat ping/pong
 * - Simplified connectionStatus for dashboard UI
 * - Full cleanup on unmount (client.destroy(), timers cleared, listeners removed)
 *
 * The JSON-RPC request/response correlation is handled by GatewayClient:
 * - Each outgoing request gets a UUID `id`
 * - Pending requests are stored in a Map<id, { resolve, reject, timer }>
 * - Incoming "res" frames are matched by `id` and resolve/reject the promise
 * - Timeouts reject the promise and clean up the pending entry
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { GatewayClient } from "@/lib/gateway-client";
import type {
  GatewayConnectionState,
  GatewayEvent,
  GatewayResponse,
} from "@/lib/gateway-types";
import type { DeviceIdentity } from "@/lib/device-identity";
import { useSettings } from "./use-settings";
import type {
  ConnectionStatus,
  AlertData,
  SystemHealthData,
  CostTrackingData,
  TokenUsageData,
  ActiveSessionsData,
  ChartsTrendsData,
} from "@/components/monitoring/monitoring-dashboard";
import type { PairingRequest } from "@/components/monitoring/pairing-request-card";
import {
  parseCostResponse,
  toLegacyCostTrackingData,
  type UsageCostData,
} from "./use-usage-cost-polling";
import {
  AlertDetector,
  mergeAlerts,
} from "@/lib/alert-detection";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback for a specific event type */
export type GatewayEventListener = (event: GatewayEvent) => void;

export interface UseGatewayMonitorOptions {
  /** Auto-connect when gatewayWsUrl is available (default: true) */
  autoConnect?: boolean;
  /** Polling interval for cost/usage data in ms (default: 30000) */
  pollIntervalMs?: number;
  /** Called for every push event from the gateway */
  onEvent?: (event: GatewayEvent) => void;
  /** Called when connection/auth state changes */
  onStateChange?: (state: GatewayConnectionState) => void;
  /** Called when auth completes with granted scopes */
  onAuthenticated?: (scopes: string[]) => void;
  /** Called when pairing is pending operator approval */
  onPendingPairing?: () => void;
  /** Called on any error */
  onError?: (error: Error) => void;
}

export interface UseGatewayMonitorReturn {
  /** Full connection + auth state */
  connectionState: GatewayConnectionState;
  /** Simplified connection status for the monitoring dashboard UI */
  connectionStatus: ConnectionStatus;
  /** Whether authenticated and fully connected */
  isConnected: boolean;
  /** Whether the WebSocket transport is open (regardless of auth state) */
  isWsOpen: boolean;
  /** Whether currently in any connecting/authenticating state */
  isConnecting: boolean;
  /** Whether awaiting operator pairing approval */
  isPendingPairing: boolean;
  /** Granted scopes after authentication */
  scopes: string[];
  /** Current device identity (null before first connect) */
  identity: DeviceIdentity | null;
  /** Last received gateway push event */
  lastEvent: GatewayEvent | null;
  /** Error message if any */
  error: string | null;
  /** Round-trip latency from last heartbeat ping/pong (ms) */
  latencyMs: number | null;

  // --- Widget data (updated via push events + polling) ---
  alerts: AlertData[] | undefined;
  systemHealth: SystemHealthData | undefined;
  costTracking: CostTrackingData | undefined;
  /** Enriched cost data with today/all-time/projected/per-model breakdown */
  usageCost: UsageCostData | undefined;
  tokenUsage: TokenUsageData | undefined;
  activeSessions: ActiveSessionsData | undefined;
  chartsTrends: ChartsTrendsData | undefined;
  /** Pending pairing requests (only populated when operator.pairing scope is granted) */
  pairingRequests: PairingRequest[] | undefined;

  /**
   * Send a JSON-RPC request and await the correlated response.
   *
   * Uses UUID-correlated req/res matching with configurable timeout.
   * The underlying GatewayClient.request():
   * 1. Generates a UUID v4 id for the request
   * 2. Creates a pending entry: { id, method, resolve, reject, timer, createdAt }
   * 3. Stores it in the pendingRequests Map keyed by id
   * 4. Sets a timeout timer that rejects with TimeoutError and cleans up
   * 5. Sends the JSON-RPC frame: { frame: "req", id, method, params }
   * 6. When a "res" frame arrives with matching id, handleResponse():
   *    - Looks up the pending entry by id
   *    - Clears the timeout timer
   *    - Removes the entry from the map
   *    - Resolves the promise with the response
   */
  sendRequest: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<GatewayResponse>;

  /** Manually connect to the gateway */
  connect: () => void;
  /** Disconnect from the gateway */
  disconnect: () => void;
  /** Force reconnect (disconnect + connect) */
  reconnect: () => void;
  /** Manual refresh of polled data (cost, usage, sessions, trends) */
  refresh: () => Promise<void>;
  /** Whether a refresh is currently in-flight */
  isRefreshing: boolean;

  // --- Pairing admin actions ---
  /**
   * Approve a pending device pairing request.
   * Sends a "pairing.approve" JSON-RPC request with the request ID.
   * Optimistically removes the request from the local list, rolling back on error.
   */
  approvePairing: (requestId: string) => Promise<void>;
  /**
   * Reject a pending device pairing request.
   * Sends a "pairing.reject" JSON-RPC request with the request ID.
   * Optimistically removes the request from the local list, rolling back on error.
   */
  rejectPairing: (requestId: string) => Promise<void>;

  // --- Event listener management ---
  /**
   * Subscribe to a specific gateway event type.
   * Use type "*" to receive all events (wildcard listener).
   */
  addEventListener: (type: string, listener: GatewayEventListener) => void;
  /** Unsubscribe a previously registered listener */
  removeEventListener: (type: string, listener: GatewayEventListener) => void;
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

const INITIAL_STATE: GatewayConnectionState = {
  wsState: "disconnected",
  authState: "disconnected",
  scopes: [],
  error: null,
  lastAuthAt: null,
  latencyMs: null,
};

// ---------------------------------------------------------------------------
// Event type constants — matching the OpenClaw gateway push event types
// ---------------------------------------------------------------------------

const EVENT_TYPES = {
  HEALTH_UPDATE: "health.update",
  ALERT_NEW: "alert.new",
  ALERT_RESOLVED: "alert.resolved",
  ALERTS_SNAPSHOT: "alerts.snapshot",
  SESSION_UPDATE: "session.update",
  SESSIONS_SNAPSHOT: "sessions.snapshot",
  /** Real-time push event for session changes (after sessions.subscribe) */
  SESSIONS_CHANGED: "sessions.changed",
  COST_UPDATE: "cost.update",
  TOKEN_USAGE_UPDATE: "token_usage.update",
  TRENDS_UPDATE: "trends.update",
  DEVICE_PAIRED: "device.paired",
  /** Push event: new pairing request from a device awaiting approval */
  PAIRING_REQUEST: "pairing.request",
  /** Push event: a pairing request was resolved (approved/rejected) by another operator */
  PAIRING_RESOLVED: "pairing.resolved",
  /** Push event: snapshot of all pending pairing requests */
  PAIRING_SNAPSHOT: "pairing.snapshot",
} as const;

// Health request method — sent once on connect after auth
const HEALTH_METHOD = "system.health" as const;

// Subscription methods — sent once on connect after auth to register for push events
const SUBSCRIBE_METHODS = {
  SESSIONS: "sessions.subscribe",
  PAIRING: "pairing.subscribe",
} as const;

// Pairing admin action methods
const PAIRING_METHODS = {
  APPROVE: "pairing.approve",
  REJECT: "pairing.reject",
  LIST: "pairing.list",
} as const;

// Polling request methods
const POLL_METHODS = {
  COST: "metrics.cost",
  TOKEN_USAGE: "metrics.token_usage",
  SESSIONS: "sessions.list",
  TRENDS: "metrics.trends",
} as const;

const DEFAULT_POLL_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Helper: parse raw health response into typed SystemHealthData
// ---------------------------------------------------------------------------

/**
 * Maps the raw `system.health` JSON-RPC response result into the typed
 * `SystemHealthData` shape expected by the dashboard widget.
 *
 * The gateway response is expected to include:
 *   { cpu, ram, disk, swap, gatewayStatus, uptime, uptimeSeconds, services }
 * where cpu/ram/disk/swap are { percent, used?, total?, unit? }.
 *
 * We derive the top-level `status` field from gatewayStatus + resource pressure:
 *   - "down"     if gatewayStatus === "offline"
 *   - "degraded" if gatewayStatus === "degraded" OR any resource ≥ 90%
 *   - "healthy"  otherwise
 */
function parseHealthResponse(
  result: Record<string, unknown>
): SystemHealthData {
  const parseMetric = (
    raw: unknown
  ): { percent: number; used?: number; total?: number; unit?: string } | undefined => {
    if (!raw || typeof raw !== "object") return undefined;
    const r = raw as Record<string, unknown>;
    const percent = typeof r.percent === "number" ? r.percent : 0;
    return {
      percent,
      used: typeof r.used === "number" ? r.used : undefined,
      total: typeof r.total === "number" ? r.total : undefined,
      unit: typeof r.unit === "string" ? r.unit : undefined,
    };
  };

  const cpu = parseMetric(result.cpu);
  const ram = parseMetric(result.ram);
  const disk = parseMetric(result.disk);
  const swap = parseMetric(result.swap);

  const gatewayStatus =
    (result.gatewayStatus as string) === "offline"
      ? "offline"
      : (result.gatewayStatus as string) === "degraded"
        ? "degraded"
        : "online";

  // Format uptime from raw seconds if present, otherwise use string
  let uptime: string | undefined =
    typeof result.uptime === "string" ? result.uptime : undefined;
  const uptimeSeconds =
    typeof result.uptimeSeconds === "number" ? result.uptimeSeconds : undefined;
  if (!uptime && uptimeSeconds !== undefined) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const mins = Math.floor((uptimeSeconds % 3600) / 60);
    uptime =
      days > 0
        ? `${days}d ${hours}h ${mins}m`
        : hours > 0
          ? `${hours}h ${mins}m`
          : `${mins}m`;
  }

  // Derive top-level health status
  const anyHighPressure = [cpu, ram, disk, swap].some(
    (m) => m && m.percent >= 90
  );
  const status: SystemHealthData["status"] =
    gatewayStatus === "offline"
      ? "down"
      : gatewayStatus === "degraded" || anyHighPressure
        ? "degraded"
        : "healthy";

  const services = Array.isArray(result.services)
    ? (result.services as { name: string; status: "up" | "down" }[])
    : undefined;

  return {
    status,
    gatewayStatus,
    uptime,
    uptimeSeconds,
    cpu,
    ram,
    disk,
    swap,
    services,
  };
}

// ---------------------------------------------------------------------------
// Helper: map GatewayConnectionState → simplified ConnectionStatus
// ---------------------------------------------------------------------------

function toConnectionStatus(state: GatewayConnectionState): ConnectionStatus {
  // Fully authenticated → connected
  if (
    state.wsState === "connected" &&
    state.authState === "authenticated"
  ) {
    return "connected";
  }

  // Pending pairing is a distinct UI state
  if (state.authState === "pending_pairing") {
    return "pending-pairing";
  }

  // Any form of connecting / reconnecting / authenticating / challenge signing
  if (
    state.wsState === "connecting" ||
    state.wsState === "reconnecting" ||
    state.authState === "authenticating" ||
    state.authState === "challenge_signing" ||
    state.authState === "connecting"
  ) {
    return "connecting";
  }

  return "disconnected";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGatewayMonitor(
  options: UseGatewayMonitorOptions = {}
): UseGatewayMonitorReturn {
  const {
    autoConnect = false,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    onEvent,
    onStateChange,
    onAuthenticated,
    onPendingPairing,
    onError,
  } = options;

  const { gatewayWsUrl, isLoaded } = useSettings();

  // ── React state mirroring GatewayClient ──────────────────────────────
  const [connectionState, setConnectionState] =
    useState<GatewayConnectionState>(INITIAL_STATE);
  const [lastEvent, setLastEvent] = useState<GatewayEvent | null>(null);
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Widget data state (driven by push events + polling) ──────────────
  const [alerts, setAlerts] = useState<AlertData[] | undefined>(undefined);
  const [systemHealth, setSystemHealth] = useState<SystemHealthData | undefined>(undefined);
  const [costTracking, setCostTracking] = useState<CostTrackingData | undefined>(undefined);
  const [usageCost, setUsageCost] = useState<UsageCostData | undefined>(undefined);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | undefined>(undefined);
  const [activeSessions, setActiveSessions] = useState<ActiveSessionsData | undefined>(undefined);
  const [chartsTrends, setChartsTrends] = useState<ChartsTrendsData | undefined>(undefined);
  const [pairingRequests, setPairingRequests] = useState<PairingRequest[] | undefined>(undefined);

  // ── Alert detection ──────────────────────────────────────────────────
  // Runs all three smart warning rules (high cost, failed cron, offline
  // gateway) whenever widget data changes, then merges detected alerts
  // with any server-pushed alerts.
  const alertDetectorRef = useRef(new AlertDetector());

  // ── Refs ──────────────────────────────────────────────────────────────

  // Stable refs for callbacks to avoid re-creating the client on handler changes
  const onEventRef = useRef(onEvent);
  const onStateChangeRef = useRef(onStateChange);
  const onAuthenticatedRef = useRef(onAuthenticated);
  const onPendingPairingRef = useRef(onPendingPairing);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onStateChangeRef.current = onStateChange;
  onAuthenticatedRef.current = onAuthenticated;
  onPendingPairingRef.current = onPendingPairing;
  onErrorRef.current = onError;

  // GatewayClient instance ref
  const clientRef = useRef<GatewayClient | null>(null);
  // Track the URL we created the client with
  const urlRef = useRef<string>("");
  // Track mount status
  const mountedRef = useRef(true);

  // Event listener registry: Map<eventType, Set<listener>>
  const listenersRef = useRef<Map<string, Set<GatewayEventListener>>>(new Map());

  // Polling timer
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Event listener management ─────────────────────────────────────────

  const addEventListener = useCallback((type: string, listener: GatewayEventListener) => {
    const listeners = listenersRef.current;
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }
    listeners.get(type)!.add(listener);
  }, []);

  const removeEventListener = useCallback((type: string, listener: GatewayEventListener) => {
    const listeners = listenersRef.current;
    const set = listeners.get(type);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(type);
      }
    }
  }, []);

  // ── Internal event dispatch ───────────────────────────────────────────

  /**
   * Dispatch a GatewayEvent frame to:
   * 1. Typed widget state updaters (based on event.type)
   * 2. Registered per-type listeners
   * 3. Wildcard "*" listeners
   * 4. The onEvent callback prop
   */
  const dispatchEvent = useCallback((event: GatewayEvent) => {
    if (!mountedRef.current) return;

    // Update lastEvent state
    setLastEvent(event);

    // ── 1. Route to typed widget state updaters ──
    switch (event.type) {
      case EVENT_TYPES.HEALTH_UPDATE:
        setSystemHealth(parseHealthResponse(event.data));
        break;

      case EVENT_TYPES.ALERT_NEW: {
        const newAlert = event.data as unknown as AlertData;
        // Track server-pushed alerts separately for merge with local detection
        setServerAlerts((prev) => {
          const existing = prev ?? [];
          if (existing.some((a) => a.id === newAlert.id)) return existing;
          return [newAlert, ...existing];
        });
        // Also update the merged alerts immediately
        setAlerts((prev) => {
          const existing = prev ?? [];
          if (existing.some((a) => a.id === newAlert.id)) return existing;
          return [newAlert, ...existing];
        });
        break;
      }

      case EVENT_TYPES.ALERT_RESOLVED: {
        const resolvedId = event.data.id as string;
        setServerAlerts((prev) =>
          prev ? prev.filter((a) => a.id !== resolvedId) : prev
        );
        setAlerts((prev) =>
          prev ? prev.filter((a) => a.id !== resolvedId) : prev
        );
        break;
      }

      case EVENT_TYPES.ALERTS_SNAPSHOT:
        // Store server snapshot — the alert detection effect will
        // automatically re-merge with locally-detected alerts
        setServerAlerts(event.data.alerts as unknown as AlertData[]);
        break;

      case EVENT_TYPES.SESSION_UPDATE:
      case EVENT_TYPES.SESSIONS_SNAPSHOT:
      case EVENT_TYPES.SESSIONS_CHANGED:
        setActiveSessions(event.data as unknown as ActiveSessionsData);
        break;

      case EVENT_TYPES.COST_UPDATE: {
        const parsed = parseCostResponse(event.data);
        setUsageCost(parsed);
        setCostTracking(toLegacyCostTrackingData(parsed));
        break;
      }

      case EVENT_TYPES.TOKEN_USAGE_UPDATE:
        setTokenUsage(event.data as unknown as TokenUsageData);
        break;

      case EVENT_TYPES.TRENDS_UPDATE:
        setChartsTrends(event.data as unknown as ChartsTrendsData);
        break;

      // ── Pairing request events (operator.pairing scope) ──
      case EVENT_TYPES.PAIRING_REQUEST: {
        const newRequest = event.data as unknown as PairingRequest;
        setPairingRequests((prev) => {
          const existing = prev ?? [];
          // Avoid duplicates by id
          if (existing.some((r) => r.id === newRequest.id)) return existing;
          return [newRequest, ...existing];
        });
        break;
      }

      case EVENT_TYPES.PAIRING_RESOLVED: {
        const resolvedId = event.data.id as string;
        setPairingRequests((prev) =>
          prev ? prev.filter((r) => r.id !== resolvedId) : prev
        );
        break;
      }

      case EVENT_TYPES.PAIRING_SNAPSHOT:
        setPairingRequests(
          event.data.requests as unknown as PairingRequest[]
        );
        break;

      default:
        // Unknown event type — still forwarded to listeners below
        break;
    }

    // ── 2. Forward to registered per-type listeners ──
    const typeListeners = listenersRef.current.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error(
            `[useGatewayMonitor] Error in event listener for "${event.type}":`,
            err
          );
        }
      });
    }

    // ── 3. Forward to wildcard "*" listeners ──
    const wildcardListeners = listenersRef.current.get("*");
    if (wildcardListeners) {
      wildcardListeners.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error(
            "[useGatewayMonitor] Error in wildcard event listener:",
            err
          );
        }
      });
    }

    // ── 4. Forward to onEvent callback prop ──
    onEventRef.current?.(event);
  }, []);

  // ── Session subscription (sent once on connect after auth) ──────────────

  /**
   * Sends a `sessions.subscribe` JSON-RPC request to the gateway to register
   * for real-time push updates. Once subscribed, the server will send
   * `sessions.changed` events whenever sessions are created, updated, or
   * destroyed — eliminating the need to wait for the next 30-second poll
   * for session data to refresh.
   *
   * The subscription is best-effort: if it fails (e.g., the gateway doesn't
   * support it), session data still arrives via polling.
   */
  const subscribeSessions = useCallback(async () => {
    const client = clientRef.current;
    if (!client || client.getState().authState !== "authenticated") return;

    try {
      const response = await client.request(SUBSCRIBE_METHODS.SESSIONS);
      if (response.ok) {
        console.debug(
          "[useGatewayMonitor] sessions.subscribe succeeded — receiving real-time session updates"
        );
      } else {
        console.debug(
          "[useGatewayMonitor] sessions.subscribe declined:",
          response.error?.message ?? "unknown error"
        );
      }
    } catch (err) {
      // Subscription failure is non-fatal — sessions will still be polled
      console.debug(
        "[useGatewayMonitor] sessions.subscribe failed (non-fatal, falling back to polling):",
        err instanceof Error ? err.message : err
      );
    }
  }, []);

  // ── Pairing subscription + initial fetch (operator.pairing scope only) ──

  const subscribePairing = useCallback(async () => {
    const client = clientRef.current;
    if (!client || client.getState().authState !== "authenticated") return;
    const currentScopes = client.getState().scopes;
    if (!currentScopes.includes("operator.pairing")) return;

    try {
      const subRes = await client.request(SUBSCRIBE_METHODS.PAIRING);
      if (subRes.ok) {
        console.debug("[useGatewayMonitor] pairing.subscribe succeeded");
      }
    } catch {
      // Non-fatal
    }

    try {
      const listRes = await client.request(PAIRING_METHODS.LIST);
      if (!mountedRef.current) return;
      if (listRes.ok && listRes.result) {
        const requests = (listRes.result.requests ?? listRes.result) as unknown as PairingRequest[];
        setPairingRequests(Array.isArray(requests) ? requests : []);
      }
    } catch {
      console.debug("[useGatewayMonitor] pairing.list failed (non-fatal)");
    }
  }, []);

  // ── Health request (sent once on connect, then updated via push events) ──

  /**
   * Sends a `system.health` JSON-RPC request to the gateway and parses the
   * response into typed SystemHealthData. Called immediately after auth
   * completes to populate the System Health widget without waiting for the
   * first push event.
   */
  const fetchHealth = useCallback(async () => {
    const client = clientRef.current;
    if (!client || client.getState().authState !== "authenticated") return;

    try {
      const response = await client.request(HEALTH_METHOD);
      if (!mountedRef.current) return;

      if (response.ok && response.result) {
        const healthData = parseHealthResponse(response.result);
        setSystemHealth(healthData);
      }
    } catch (err) {
      // Health fetch failure is non-fatal — the widget stays in skeleton
      // state and will update when the first health.update push event arrives.
      console.warn(
        "[useGatewayMonitor] Failed to fetch initial health:",
        err instanceof Error ? err.message : err
      );
    }
  }, []);

  // ── Polling for cost/usage data ───────────────────────────────────────

  const fetchPolledData = useCallback(async () => {
    const client = clientRef.current;
    if (!client || client.getState().authState !== "authenticated") return;

    try {
      // Fire all poll requests concurrently
      const [costRes, tokenRes, sessionsRes, trendsRes] = await Promise.allSettled([
        client.request(POLL_METHODS.COST),
        client.request(POLL_METHODS.TOKEN_USAGE),
        client.request(POLL_METHODS.SESSIONS),
        client.request(POLL_METHODS.TRENDS),
      ]);

      if (!mountedRef.current) return;

      if (costRes.status === "fulfilled" && costRes.value.ok && costRes.value.result) {
        const parsed = parseCostResponse(costRes.value.result);
        setUsageCost(parsed);
        // Also update legacy costTracking for backward compatibility
        setCostTracking(toLegacyCostTrackingData(parsed));
      }
      if (tokenRes.status === "fulfilled" && tokenRes.value.ok && tokenRes.value.result) {
        setTokenUsage(tokenRes.value.result as unknown as TokenUsageData);
      }
      if (sessionsRes.status === "fulfilled" && sessionsRes.value.ok && sessionsRes.value.result) {
        setActiveSessions(sessionsRes.value.result as unknown as ActiveSessionsData);
      }
      if (trendsRes.status === "fulfilled" && trendsRes.value.ok && trendsRes.value.result) {
        setChartsTrends(trendsRes.value.result as unknown as ChartsTrendsData);
      }
    } catch {
      // Silently ignore polling errors — data freshness is best-effort
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    // Immediate first fetch
    fetchPolledData();
    pollTimerRef.current = setInterval(fetchPolledData, pollIntervalMs);
  }, [fetchPolledData, pollIntervalMs, stopPolling]);

  // ── Alert detection effect ───────────────────────────────────────────
  // Re-evaluate local alert rules whenever the underlying widget data
  // changes (system health push events, polled cost/session data).
  // Merges locally-detected alerts with any server-pushed alerts so the
  // Alert Banners widget shows both sources.

  // Server-pushed alerts stored separately so they can be merged with
  // locally-detected alerts from the three smart warning rules.
  const [serverAlerts, setServerAlerts] = useState<AlertData[] | undefined>(undefined);

  useEffect(() => {
    if (!mountedRef.current) return;

    const detector = alertDetectorRef.current;
    const detected = detector.evaluateAll({
      costData: costTracking,
      sessionsData: activeSessions,
      healthData: systemHealth,
    });

    const merged = mergeAlerts(serverAlerts, detected);
    setAlerts(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costTracking, activeSessions, systemHealth, serverAlerts]);

  /** Manual refresh (exposed to UI Refresh button) */
  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchPolledData();
    } finally {
      if (mountedRef.current) {
        setIsRefreshing(false);
      }
    }
  }, [fetchPolledData, isRefreshing]);

  // ── Initialize/update GatewayClient ───────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    if (!isLoaded) return;

    if (!gatewayWsUrl) {
      // No URL configured — clean up
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
        urlRef.current = "";
        setConnectionState(INITIAL_STATE);
        setIdentity(null);
        setLastEvent(null);
      }
      return;
    }

    const urlChanged = urlRef.current !== gatewayWsUrl;

    // If client exists and URL changed, update the URL but do NOT
    // auto-connect — user must click Connect manually.
    if (clientRef.current && urlChanged) {
      clientRef.current.disconnect();
      clientRef.current.setGatewayUrl(gatewayWsUrl);
      urlRef.current = gatewayWsUrl;
      return;
    }

    // Create new client if none exists
    if (!clientRef.current) {
      urlRef.current = gatewayWsUrl;
      const client = new GatewayClient(gatewayWsUrl);

      client.on({
        onStateChange: (state) => {
          if (!mountedRef.current) return;
          setConnectionState({ ...state });
          onStateChangeRef.current?.(state);
        },

        onEvent: (event) => {
          // Route through the dispatch pipeline
          dispatchEvent(event);
        },

        onAuthenticated: (scopes) => {
          if (!mountedRef.current) return;
          // Update identity in case deviceToken was updated during auth
          const id = client.getIdentity();
          if (id) setIdentity({ ...id });
          onAuthenticatedRef.current?.(scopes);
          // Fetch initial health data immediately on connect
          fetchHealth();
          // Subscribe to real-time session change events
          subscribeSessions();
          // Subscribe to pairing events if operator.pairing scope granted
          subscribePairing();
          // Start polling once authenticated
          startPolling();
        },

        onPendingPairing: () => {
          if (!mountedRef.current) return;
          onPendingPairingRef.current?.();
          // Stop polling while pending — no data access yet
          stopPolling();
        },

        onError: (err) => {
          if (!mountedRef.current) return;
          onErrorRef.current?.(err);
        },
      });

      clientRef.current = client;

      if (autoConnect) {
        client.connect();
        // Identity is generated on connect via getOrCreateDeviceIdentity
        const id = client.getIdentity();
        if (id) setIdentity({ ...id });
      }
    }

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;

      // Stop polling timer
      stopPolling();

      // Destroy the gateway client (disconnects WS, cancels pending requests, clears handlers)
      if (clientRef.current) {
        clientRef.current.destroy();
        clientRef.current = null;
        urlRef.current = "";
      }

      // Clear all registered event listeners
      listenersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, gatewayWsUrl, autoConnect]);

  // ── Stable action callbacks ───────────────────────────────────────────

  const sendRequest = useCallback(
    async (
      method: string,
      params: Record<string, unknown> = {},
      timeoutMs?: number
    ): Promise<GatewayResponse> => {
      if (!clientRef.current) {
        throw new Error("Gateway client not initialized");
      }
      return clientRef.current.request(method, params, timeoutMs);
    },
    []
  );

  const connect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.connect();
      // Identity is generated on connect; update state
      const id = clientRef.current.getIdentity();
      if (id) setIdentity({ ...id });
    }
  }, []);

  const disconnect = useCallback(() => {
    stopPolling();
    clientRef.current?.disconnect();
  }, [stopPolling]);

  const reconnect = useCallback(() => {
    stopPolling();
    if (clientRef.current) {
      clientRef.current.reconnect();
      // Identity may have been regenerated; update state
      const id = clientRef.current.getIdentity();
      if (id) setIdentity({ ...id });
    }
  }, [stopPolling]);

  // ── Pairing admin actions ─────────────────────────────────────────────

  /**
   * Approve a pending device pairing request.
   *
   * Sends a "pairing.approve" JSON-RPC request to the gateway.
   * Uses optimistic UI: removes the request from the local list immediately,
   * then rolls back on error to provide instant feedback.
   */
  const approvePairing = useCallback(async (requestId: string) => {
    if (!clientRef.current) {
      throw new Error("Gateway client not initialized");
    }

    // Optimistically remove the request from the list
    let rollbackEntry: PairingRequest | undefined;
    setPairingRequests((prev) => {
      if (!prev) return prev;
      rollbackEntry = prev.find((r) => r.id === requestId);
      return prev.filter((r) => r.id !== requestId);
    });

    try {
      const response = await clientRef.current.request(PAIRING_METHODS.APPROVE, {
        requestId,
      });

      if (!response.ok) {
        const errMsg = response.error?.message || "Failed to approve pairing request";
        // Roll back optimistic removal
        if (rollbackEntry) {
          setPairingRequests((prev) => {
            const current = prev ?? [];
            if (current.some((r) => r.id === requestId)) return current;
            return [rollbackEntry!, ...current];
          });
        }
        throw new Error(errMsg);
      }
    } catch (err) {
      // Roll back optimistic removal on network/timeout errors
      if (rollbackEntry && !(err instanceof Error && err.message.includes("Failed to approve"))) {
        setPairingRequests((prev) => {
          const current = prev ?? [];
          if (current.some((r) => r.id === requestId)) return current;
          return [rollbackEntry!, ...current];
        });
      }
      throw err instanceof Error ? err : new Error("Failed to approve pairing request");
    }
  }, []);

  /**
   * Reject a pending device pairing request.
   *
   * Sends a "pairing.reject" JSON-RPC request to the gateway.
   * Uses optimistic UI: removes the request from the local list immediately,
   * then rolls back on error to provide instant feedback.
   */
  const rejectPairing = useCallback(async (requestId: string) => {
    if (!clientRef.current) {
      throw new Error("Gateway client not initialized");
    }

    // Optimistically remove the request from the list
    let rollbackEntry: PairingRequest | undefined;
    setPairingRequests((prev) => {
      if (!prev) return prev;
      rollbackEntry = prev.find((r) => r.id === requestId);
      return prev.filter((r) => r.id !== requestId);
    });

    try {
      const response = await clientRef.current.request(PAIRING_METHODS.REJECT, {
        requestId,
      });

      if (!response.ok) {
        const errMsg = response.error?.message || "Failed to reject pairing request";
        // Roll back optimistic removal
        if (rollbackEntry) {
          setPairingRequests((prev) => {
            const current = prev ?? [];
            if (current.some((r) => r.id === requestId)) return current;
            return [rollbackEntry!, ...current];
          });
        }
        throw new Error(errMsg);
      }
    } catch (err) {
      // Roll back optimistic removal on network/timeout errors
      if (rollbackEntry && !(err instanceof Error && err.message.includes("Failed to reject"))) {
        setPairingRequests((prev) => {
          const current = prev ?? [];
          if (current.some((r) => r.id === requestId)) return current;
          return [rollbackEntry!, ...current];
        });
      }
      throw err instanceof Error ? err : new Error("Failed to reject pairing request");
    }
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────

  const connectionStatus = useMemo(
    () => toConnectionStatus(connectionState),
    [connectionState]
  );

  const isConnected =
    connectionState.wsState === "connected" &&
    connectionState.authState === "authenticated";

  const isWsOpen = connectionState.wsState === "connected";

  const isConnecting =
    connectionState.wsState === "connecting" ||
    connectionState.wsState === "reconnecting" ||
    connectionState.authState === "authenticating" ||
    connectionState.authState === "challenge_signing";

  const isPendingPairing = connectionState.authState === "pending_pairing";

  // ── Return ────────────────────────────────────────────────────────────

  return {
    connectionState,
    connectionStatus,
    isConnected,
    isWsOpen,
    isConnecting,
    isPendingPairing,
    scopes: connectionState.scopes,
    identity,
    lastEvent,
    error: connectionState.error,
    latencyMs: connectionState.latencyMs,

    // Widget data
    alerts,
    systemHealth,
    costTracking,
    usageCost,
    tokenUsage,
    activeSessions,
    chartsTrends,
    pairingRequests,

    // Actions
    sendRequest,
    connect,
    disconnect,
    reconnect,
    refresh,
    isRefreshing,
    approvePairing,
    rejectPairing,

    // Event listener management
    addEventListener,
    removeEventListener,
  };
}
