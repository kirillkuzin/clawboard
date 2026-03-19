/**
 * Connection Manager
 *
 * Manages the real-time connection to the OpenClaw API with automatic
 * transport fallback: WebSocket → SSE → Polling.
 *
 * Uses TransportManager for WebSocket/SSE, and falls back to REST polling
 * when neither is available. Emits normalized events and state updates
 * through a unified interface regardless of which transport is active.
 */

import { getConnectionConfig } from "./api-client";
import {
  TransportManager,
  type TransportType,
  type TransportEvent,
  type TransportManagerConfig,
} from "./realtime";
import type {
  AgentInfo,
  AgentStatus,
  ConversationInfo,
  SubAgentInfo,
  ResourceCounts,
  ActivityEvent,
  ConnectionState,
  ConnectionStatus,
  RealtimeState,
} from "./types/events";

// ── Configuration ─────────────────────────────────────────────

export interface ConnectionManagerConfig {
  /** Polling interval in ms (default: 5000) */
  pollInterval?: number;
  /** Max reconnect attempts before giving up (default: 10) */
  maxReconnectAttempts?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseReconnectDelay?: number;
  /** Maximum events to keep in the rolling buffer (default: 100) */
  maxEventBuffer?: number;
  /** Force a specific transport (skip auto-detection) */
  forceTransport?: TransportType;
  /** WebSocket probe timeout in ms (default: 5000) */
  wsProbeTimeout?: number;
}

const DEFAULT_CONFIG: Required<ConnectionManagerConfig> = {
  pollInterval: 5000,
  maxReconnectAttempts: 10,
  baseReconnectDelay: 1000,
  maxEventBuffer: 100,
  forceTransport: "" as TransportType,
  wsProbeTimeout: 5000,
};

// ── Event Emitter ─────────────────────────────────────────────

type Listener<T> = (data: T) => void;

class MiniEmitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(fn as Listener<unknown>);
    return () => set.delete(fn as Listener<unknown>);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  removeAll(): void {
    this.listeners.clear();
  }
}

// ── Manager Events ────────────────────────────────────────────

interface ManagerEvents extends Record<string, unknown> {
  stateChange: RealtimeState;
  connectionChange: ConnectionState;
  activity: ActivityEvent;
  error: Error;
}

// ── Helpers ───────────────────────────────────────────────────

let eventCounter = 0;
function makeEventId(): string {
  return `evt_${Date.now()}_${++eventCounter}`;
}

function normalizeAgentStatus(raw: string): AgentStatus {
  const s = (raw || "").toLowerCase();
  if (s === "idle" || s === "ready" || s === "waiting") return "idle";
  if (s === "busy" || s === "running" || s === "processing" || s === "working")
    return "busy";
  if (s === "error" || s === "failed" || s === "unhealthy") return "error";
  if (s === "starting" || s === "initializing" || s === "booting")
    return "starting";
  if (s === "offline" || s === "stopped" || s === "terminated") return "offline";
  return "idle";
}

// ── Connection Manager ────────────────────────────────────────

export class ConnectionManager {
  private config: Required<ConnectionManagerConfig>;
  private emitter = new MiniEmitter<ManagerEvents>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /** Transport manager for WebSocket/SSE */
  private transportManager: TransportManager | null = null;
  /** Which transport is currently active */
  private _activeTransport: TransportType | null = null;

  private state: RealtimeState = {
    connection: {
      status: "disconnected",
      lastConnected: null,
      lastError: null,
      reconnectAttempt: 0,
      latencyMs: null,
    },
    agents: [],
    conversations: [],
    subAgents: [],
    resourceCounts: {
      skills: 0,
      providers: 0,
      channels: 0,
      webhooks: 0,
      plugins: 0,
      crons: 0,
    },
    recentEvents: [],
  };

  // Track previous agent states for diffing
  private prevAgentMap = new Map<string, AgentStatus>();

  constructor(config: ConnectionManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────────────────

  /** Get the currently active transport type */
  get activeTransport(): TransportType | null {
    return this._activeTransport;
  }

  /**
   * Start the connection with automatic transport detection.
   * Tries WebSocket → SSE → Polling in order.
   */
  start(): void {
    if (this.destroyed) return;
    this.setConnectionStatus("connecting");
    this.startWithTransportDetection();
  }

  /** Stop all connections and clean up */
  stop(): void {
    this.stopPolling();
    this.stopTransport();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setConnectionStatus("disconnected");
  }

  /** Permanently destroy this manager */
  destroy(): void {
    this.stop();
    this.destroyed = true;
    this.emitter.removeAll();
  }

  /** Subscribe to state changes */
  onStateChange(fn: Listener<RealtimeState>): () => void {
    return this.emitter.on("stateChange", fn);
  }

  /** Subscribe to connection status changes */
  onConnectionChange(fn: Listener<ConnectionState>): () => void {
    return this.emitter.on("connectionChange", fn);
  }

  /** Subscribe to individual activity events */
  onActivity(fn: Listener<ActivityEvent>): () => void {
    return this.emitter.on("activity", fn);
  }

  /** Subscribe to errors */
  onError(fn: Listener<Error>): () => void {
    return this.emitter.on("error", fn);
  }

  /** Get current state snapshot */
  getState(): RealtimeState {
    return this.state;
  }

  /** Force an immediate poll (works regardless of transport) */
  refresh(): void {
    this.poll();
  }

  // ── Transport Detection ──────────────────────────────────

  private async startWithTransportDetection(): Promise<void> {
    if (this.destroyed) return;

    const config = getConnectionConfig();
    if (!config.apiUrl || !config.apiKey) {
      this.setConnectionStatus("disconnected", "No API configuration");
      return;
    }

    // Create transport manager for WS/SSE detection
    this.transportManager = new TransportManager(
      (event: TransportEvent) => this.handleTransportEvent(event),
      (status, details) => this.handleTransportStatus(status, details),
      {
        pollInterval: this.config.pollInterval,
        wsProbeTimeout: this.config.wsProbeTimeout,
        forceTransport: this.config.forceTransport || undefined,
      } as TransportManagerConfig
    );

    // Detect and connect to best available transport
    const detected = await this.transportManager.connect();
    if (this.destroyed) return;

    this._activeTransport = detected;

    // Always start REST polling for state data, regardless of transport.
    // WS/SSE provide real-time events, but polling fetches complete state.
    // For "polling" transport, this is the primary data source.
    // For WS/SSE, this refreshes state at a lower frequency.
    const interval =
      detected === "polling"
        ? this.config.pollInterval
        : this.config.pollInterval * 2; // Less frequent when WS/SSE provides events

    this.startPolling(interval);

    // Log transport detection result
    this.pushEvent({
      id: makeEventId(),
      type: "system",
      timestamp: Date.now(),
      summary: `Connected via ${detected} transport`,
      details: { transport: detected },
    });
  }

  // ── Transport Event Handling ─────────────────────────────

  private handleTransportEvent(event: TransportEvent): void {
    if (this.destroyed) return;

    // Map transport events to activity events for the UI
    const activityType = this.mapEventType(event.type);
    if (activityType) {
      this.pushEvent({
        id: makeEventId(),
        type: activityType,
        timestamp: event.receivedAt,
        agentId: (event.data.agent_id as string) || (event.data.agentId as string) || undefined,
        summary: this.summarizeEvent(event),
        details: event.data,
      });
    }

    // Update state based on real-time events
    if (
      event.type === "agent.status" ||
      event.type === "agent.updated" ||
      event.type === "agent_status_change"
    ) {
      this.handleAgentEvent(event.data);
    } else if (
      event.type === "conversation.message" ||
      event.type === "conversation.created" ||
      event.type === "conversation.updated"
    ) {
      // Trigger a refresh to get updated conversation state
      this.poll();
    }
  }

  private handleTransportStatus(
    status: string,
    details: { transport: TransportType; error?: string }
  ): void {
    if (this.destroyed) return;

    if (status === "connected") {
      this._activeTransport = details.transport;
      this.setConnectionStatus("connected");
    } else if (status === "reconnecting") {
      this.setConnectionStatus("reconnecting", details.error);
    } else if (status === "error") {
      // Transport failed — polling will continue as backup
      if (details.transport !== "polling") {
        this.pushEvent({
          id: makeEventId(),
          type: "system",
          timestamp: Date.now(),
          summary: `${details.transport} transport error: ${details.error || "unknown"}. Polling continues as fallback.`,
          details: { transport: details.transport, error: details.error },
        });
      }
    }
  }

  private mapEventType(
    type: string
  ): ActivityEvent["type"] | null {
    if (type.startsWith("agent.") || type === "agent_status_change")
      return "agent_status_change";
    if (type === "conversation.created") return "conversation_started";
    if (type === "conversation.message") return "conversation_message";
    if (type === "conversation.ended") return "conversation_ended";
    if (type === "cron.fired") return "cron_triggered";
    if (type === "webhook.fired") return "webhook_received";
    if (type.startsWith("system.")) return "system";
    if (type === "connection.established" || type === "connection.lost")
      return "system";
    return null;
  }

  private summarizeEvent(event: TransportEvent): string {
    const d = event.data;
    switch (event.type) {
      case "agent.status":
      case "agent_status_change":
        return `Agent ${d.name || d.agent_name || d.id}: ${d.from || "?"} → ${d.to || d.status || "?"}`;
      case "conversation.created":
        return `New conversation started`;
      case "conversation.message":
        return `New message in conversation ${d.conversation_id || d.id || ""}`;
      case "webhook.fired":
        return `Webhook fired: ${d.name || d.url || "unknown"}`;
      case "cron.fired":
        return `Cron job triggered: ${d.name || d.id || "unknown"}`;
      case "connection.established":
        return `Connected via ${d.transport || event.transport}`;
      default:
        return event.type;
    }
  }

  private handleAgentEvent(data: Record<string, unknown>): void {
    const agentId = String(data.id || data.agent_id || data.agentId || "");
    if (!agentId) return;

    const newStatus = normalizeAgentStatus(
      String(data.status || data.to || "")
    );

    // Update agent in state
    const existingIdx = this.state.agents.findIndex((a) => a.id === agentId);
    if (existingIdx >= 0) {
      const updated = [...this.state.agents];
      updated[existingIdx] = {
        ...updated[existingIdx],
        status: newStatus,
        currentTask: data.current_task
          ? String(data.current_task)
          : data.task
            ? String(data.task)
            : updated[existingIdx].currentTask,
        lastSeen: Date.now(),
      };
      this.state = { ...this.state, agents: updated };
      this.emitter.emit("stateChange", this.state);
    }
  }

  // ── Polling ──────────────────────────────────────────────

  private startPolling(interval?: number): void {
    this.stopPolling();
    const ms = interval ?? this.config.pollInterval;
    this.poll(); // immediate first poll
    this.pollTimer = setInterval(() => this.poll(), ms);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private stopTransport(): void {
    if (this.transportManager) {
      this.transportManager.destroy();
      this.transportManager = null;
    }
    this._activeTransport = null;
  }

  private setConnectionStatus(
    status: ConnectionStatus,
    error?: string
  ): void {
    const prev = this.state.connection.status;
    this.state = {
      ...this.state,
      connection: {
        ...this.state.connection,
        status,
        lastError: error ?? this.state.connection.lastError,
        lastConnected:
          status === "connected"
            ? Date.now()
            : this.state.connection.lastConnected,
        reconnectAttempt:
          status === "connected" || status === "disconnected"
            ? 0
            : this.state.connection.reconnectAttempt,
      },
    };
    if (prev !== status) {
      this.emitter.emit("connectionChange", this.state.connection);
      this.emitter.emit("stateChange", this.state);
    }
  }

  private pushEvent(event: ActivityEvent): void {
    this.state = {
      ...this.state,
      recentEvents: [event, ...this.state.recentEvents].slice(
        0,
        this.config.maxEventBuffer
      ),
    };
    this.emitter.emit("activity", event);
  }

  private async poll(): Promise<void> {
    if (this.destroyed) return;

    const config = getConnectionConfig();
    if (!config.apiUrl || !config.apiKey) {
      this.setConnectionStatus("disconnected", "No API configuration");
      return;
    }

    const startTime = performance.now();

    try {
      // Fetch all data in parallel for efficiency
      const results = await Promise.allSettled([
        this.fetchEndpoint("/api/v1/agents"),
        this.fetchEndpoint("/api/v1/conversations"),
        this.fetchEndpoint("/api/v1/subagents"),
        this.fetchResourceCounts(),
      ]);

      if (this.destroyed) return;

      const latencyMs = Math.round(performance.now() - startTime);

      // Process agents
      const agentsResult = results[0];
      if (agentsResult.status === "fulfilled" && agentsResult.value) {
        this.processAgents(agentsResult.value);
      }

      // Process conversations
      const convsResult = results[1];
      if (convsResult.status === "fulfilled" && convsResult.value) {
        this.processConversations(convsResult.value);
      }

      // Process sub-agents
      const subagentsResult = results[2];
      if (subagentsResult.status === "fulfilled" && subagentsResult.value) {
        this.processSubAgents(subagentsResult.value);
      }

      // Process resource counts
      const countsResult = results[3];
      if (countsResult.status === "fulfilled" && countsResult.value) {
        this.state = {
          ...this.state,
          resourceCounts: countsResult.value,
        };
      }

      // At least one successful response means we're connected
      const anySuccess = results.some((r) => r.status === "fulfilled");
      if (anySuccess) {
        this.state = {
          ...this.state,
          connection: {
            ...this.state.connection,
            status: "connected",
            lastConnected: Date.now(),
            lastError: null,
            reconnectAttempt: 0,
            latencyMs,
          },
        };
        this.emitter.emit("connectionChange", this.state.connection);
      } else {
        // All failed
        const firstError = results.find(
          (r) => r.status === "rejected"
        ) as PromiseRejectedResult | undefined;
        throw new Error(
          firstError?.reason?.message || "All API requests failed"
        );
      }

      this.emitter.emit("stateChange", this.state);
    } catch (err) {
      if (this.destroyed) return;
      const error = err instanceof Error ? err : new Error(String(err));
      this.handlePollError(error);
    }
  }

  private async fetchEndpoint(path: string): Promise<unknown> {
    const config = getConnectionConfig();

    const response = await fetch(`/api/proxy${path}`, {
      headers: {
        "Content-Type": "application/json",
        "X-OpenClaw-URL": config.apiUrl,
        "X-OpenClaw-Key": config.apiKey,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // 404 means the endpoint doesn't exist - return empty
      if (response.status === 404) return null;
      throw new Error(`API error ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  private async fetchResourceCounts(): Promise<ResourceCounts> {
    const config = getConnectionConfig();
    const endpoints = [
      "skills",
      "providers",
      "channels",
      "webhooks",
      "plugins",
      "crons",
    ] as const;

    const results = await Promise.allSettled(
      endpoints.map((ep) =>
        fetch(`/api/proxy/api/v1/${ep}`, {
          headers: {
            "Content-Type": "application/json",
            "X-OpenClaw-URL": config.apiUrl,
            "X-OpenClaw-Key": config.apiKey,
          },
          signal: AbortSignal.timeout(10000),
        }).then(async (r) => {
          if (!r.ok) return 0;
          const data = await r.json();
          if (Array.isArray(data)) return data.length;
          if (data?.items && Array.isArray(data.items))
            return data.items.length;
          if (typeof data?.count === "number") return data.count;
          if (typeof data?.total === "number") return data.total;
          return 0;
        })
      )
    );

    const counts: ResourceCounts = {
      skills: 0,
      providers: 0,
      channels: 0,
      webhooks: 0,
      plugins: 0,
      crons: 0,
    };

    endpoints.forEach((ep, i) => {
      const r = results[i];
      counts[ep] = r.status === "fulfilled" ? r.value : 0;
    });

    return counts;
  }

  private processAgents(raw: unknown): void {
    const list = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>)?.items ??
        (raw as Record<string, unknown>)?.agents ??
        [];
    if (!Array.isArray(list)) return;

    const now = Date.now();
    const agents: AgentInfo[] = list.map(
      (a: Record<string, unknown>): AgentInfo => ({
        id: String(a.id ?? a.agent_id ?? ""),
        name: String(a.name ?? a.agent_name ?? a.id ?? "Unknown"),
        status: normalizeAgentStatus(String(a.status ?? "")),
        currentTask: a.current_task
          ? String(a.current_task)
          : a.task
            ? String(a.task)
            : undefined,
        lastSeen: a.last_seen
          ? new Date(String(a.last_seen)).getTime()
          : now,
        metadata: a.metadata as Record<string, unknown> | undefined,
      })
    );

    // Diff against previous state for activity events
    const newMap = new Map(agents.map((a) => [a.id, a.status]));
    for (const agent of agents) {
      const prev = this.prevAgentMap.get(agent.id);
      if (prev !== undefined && prev !== agent.status) {
        this.pushEvent({
          id: makeEventId(),
          type: "agent_status_change",
          timestamp: now,
          agentId: agent.id,
          summary: `${agent.name}: ${prev} → ${agent.status}`,
          details: { from: prev, to: agent.status },
        });
      }
    }
    this.prevAgentMap = newMap;

    this.state = { ...this.state, agents };
  }

  private processConversations(raw: unknown): void {
    const list = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>)?.items ??
        (raw as Record<string, unknown>)?.conversations ??
        [];
    if (!Array.isArray(list)) return;

    const conversations: ConversationInfo[] = list.map(
      (c: Record<string, unknown>): ConversationInfo => ({
        id: String(c.id ?? c.conversation_id ?? ""),
        agentId: String(c.agent_id ?? c.agentId ?? ""),
        channelId: c.channel_id
          ? String(c.channel_id)
          : c.channelId
            ? String(c.channelId)
            : undefined,
        status:
          c.status === "active" || c.status === "completed" || c.status === "failed"
            ? (c.status as "active" | "completed" | "failed")
            : "active",
        messageCount: Number(c.message_count ?? c.messageCount ?? 0),
        startedAt: c.started_at
          ? new Date(String(c.started_at)).getTime()
          : c.created_at
            ? new Date(String(c.created_at)).getTime()
            : Date.now(),
        lastMessageAt: c.last_message_at
          ? new Date(String(c.last_message_at)).getTime()
          : c.updated_at
            ? new Date(String(c.updated_at)).getTime()
            : Date.now(),
        summary: c.summary ? String(c.summary) : undefined,
      })
    );

    this.state = { ...this.state, conversations };
  }

  private processSubAgents(raw: unknown): void {
    const list = Array.isArray(raw)
      ? raw
      : (raw as Record<string, unknown>)?.items ??
        (raw as Record<string, unknown>)?.subagents ??
        (raw as Record<string, unknown>)?.sub_agents ??
        [];
    if (!Array.isArray(list)) return;

    const subAgents: SubAgentInfo[] = list.map(
      (s: Record<string, unknown>): SubAgentInfo => ({
        id: String(s.id ?? s.subagent_id ?? ""),
        parentAgentId: String(
          s.parent_agent_id ?? s.parentAgentId ?? s.parent_id ?? ""
        ),
        name: String(s.name ?? s.agent_name ?? s.id ?? "Sub-Agent"),
        status: normalizeAgentStatus(String(s.status ?? "")),
        task: s.task ? String(s.task) : undefined,
        createdAt: s.created_at
          ? new Date(String(s.created_at)).getTime()
          : Date.now(),
        lastSeen: s.last_seen
          ? new Date(String(s.last_seen)).getTime()
          : Date.now(),
      })
    );

    this.state = { ...this.state, subAgents };
  }

  private handlePollError(error: Error): void {
    const attempt = this.state.connection.reconnectAttempt + 1;
    const msg = error.message;

    if (attempt > this.config.maxReconnectAttempts) {
      this.setConnectionStatus(
        "error",
        `Max reconnect attempts (${this.config.maxReconnectAttempts}) exceeded: ${msg}`
      );
      this.stopPolling();
      this.pushEvent({
        id: makeEventId(),
        type: "error",
        timestamp: Date.now(),
        summary: `Connection lost after ${this.config.maxReconnectAttempts} attempts`,
        details: { error: msg },
      });
      this.emitter.emit("error", error);
      return;
    }

    // Exponential backoff
    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, attempt - 1),
      30000
    );

    this.state = {
      ...this.state,
      connection: {
        ...this.state.connection,
        status: "reconnecting",
        reconnectAttempt: attempt,
        lastError: msg,
      },
    };
    this.emitter.emit("connectionChange", this.state.connection);
    this.emitter.emit("stateChange", this.state);

    // The regular polling interval will retry automatically,
    // but we record the reconnect state for UI display
    if (attempt === 1) {
      this.pushEvent({
        id: makeEventId(),
        type: "system",
        timestamp: Date.now(),
        summary: `Connection issue: ${msg}. Retrying...`,
        details: { error: msg, attempt, nextRetryMs: delay },
      });
    }
  }
}
