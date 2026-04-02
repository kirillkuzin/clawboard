"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  AlertTriangle,
  Activity,
  BarChart3,
  Users,
  TrendingUp,
  RefreshCw,
  Wifi,
  WifiOff,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { CostTrackingCard } from "./cost-tracking-card";
import {
  TokenUsageAnalytics,
  type TokenUsageAnalyticsData,
  type ModelTokenUsage,
  type TimeRange,
} from "./token-usage-analytics";
import { SystemHealthCard } from "./system-health-card";
import { ActiveSessionsCard } from "./active-sessions-card";
import { AlertBanners } from "./alert-banners";
import { ChartsTrendsCard } from "./charts-trends-card";
import { PairingApprovalPanel } from "./pairing-approval-panel";
import type { PairingRequest } from "./pairing-request-card";
import type { GatewayResponse, GatewayEvent } from "@/lib/gateway-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConnectionStatus = "disconnected" | "connecting" | "pending-pairing" | "connected";

export interface MonitoringDashboardProps {
  /** Current gateway WS connection status */
  connectionStatus?: ConnectionStatus;
  /** Scopes granted after pairing (used to gate widgets) */
  scopes?: string[];
  /** Callback when user clicks the manual Refresh button */
  onRefresh?: () => void;
  /** Whether a refresh is currently in-flight */
  isRefreshing?: boolean;
  /** Callback when user clicks Refresh on the Token Usage widget */
  onTokenRefresh?: (timeRange: TimeRange) => void;
  /** Whether token usage refresh is in-flight */
  isTokenRefreshing?: boolean;

  // --- Pairing approval (operator admin) ---
  /** Send a JSON-RPC request to the gateway (for pairing panel) */
  sendRequest?: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<GatewayResponse>;
  /** Subscribe to gateway push events (for pairing panel) */
  addGatewayEventListener?: (type: string, listener: (event: GatewayEvent) => void) => void;
  /** Unsubscribe from gateway push events (for pairing panel) */
  removeGatewayEventListener?: (type: string, listener: (event: GatewayEvent) => void) => void;
  /** Whether the gateway connection is fully authenticated */
  isGatewayConnected?: boolean;

  // --- Widget data (optional – widgets show skeletons when undefined) ---
  alerts?: AlertData[];
  systemHealth?: SystemHealthData;
  costTracking?: CostTrackingData;
  tokenUsage?: TokenUsageData;
  activeSessions?: ActiveSessionsData;
  chartsTrends?: ChartsTrendsData;
  /** Pending pairing requests (only relevant when operator.pairing scope is granted) */
  pairingRequests?: PairingRequest[];
  /** Callback to approve a pairing request by ID */
  onApprovePairing?: (requestId: string) => Promise<void>;
  /** Callback to reject a pairing request by ID */
  onRejectPairing?: (requestId: string) => Promise<void>;
}

// Placeholder data shapes – sibling agents will flesh these out
export interface AlertData {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  timestamp: string;
}
/** Resource usage metric (0–100 percent) */
export interface ResourceMetric {
  percent: number;
  used?: number;
  total?: number;
  /** Display unit, e.g. "GB", "MB" */
  unit?: string;
}

export interface SystemHealthData {
  status: "healthy" | "degraded" | "down";
  gatewayStatus: "online" | "degraded" | "offline";
  uptime?: string;
  /** Seconds since gateway start — raw value for formatting */
  uptimeSeconds?: number;
  cpu?: ResourceMetric;
  ram?: ResourceMetric;
  disk?: ResourceMetric;
  swap?: ResourceMetric;
  services?: { name: string; status: "up" | "down" }[];
}
export interface CostTrackingData {
  totalCost?: number;
  dailyCost?: number;
  /** Projected monthly cost based on recent usage trends */
  projectedMonthlyCost?: number;
  currency?: string;
  breakdown?: { label: string; amount: number }[];
  /** Per-model cost breakdown (e.g. claude-3.5-sonnet, gpt-4o) */
  modelBreakdown?: { model: string; cost: number; tokens?: number }[];
  /** Budget limit (if configured on the gateway) */
  budgetLimit?: number;
  /** ISO timestamp of last data refresh */
  lastUpdated?: string;
}
export interface TokenUsageData {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  /** Per-model token breakdown */
  models?: ModelTokenUsage[];
  history?: { date: string; tokens: number }[];
}
/** Session type badge variants */
export type SessionType = "dm" | "group" | "cron" | "subagent";

export interface SessionEntry {
  id: string;
  agent: string;
  started: string;
  /** Model powering this session (e.g. "claude-3.5-sonnet") */
  model?: string;
  /** Session type for badge display */
  type?: SessionType;
  /** Context window usage (0–100 percent) */
  contextPercent?: number;
  /** Context tokens used */
  contextUsed?: number;
  /** Context window capacity */
  contextTotal?: number;
}

export interface ActiveSessionsData {
  count?: number;
  sessions?: SessionEntry[];
}
export interface ChartsTrendsData {
  series?: { name: string; data: { x: string; y: number }[] }[];
}

// ---------------------------------------------------------------------------
// Connection Status Banner
// ---------------------------------------------------------------------------

function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status === "connected") return null;

  const config: Record<
    Exclude<ConnectionStatus, "connected">,
    { icon: React.ReactNode; label: string; color: string }
  > = {
    disconnected: {
      icon: <WifiOff size={14} />,
      label: "Not connected to gateway",
      color: "border-destructive/40 bg-destructive/5 text-destructive",
    },
    connecting: {
      icon: <Wifi size={14} className="animate-pulse" />,
      label: "Connecting to gateway…",
      color: "border-yellow-500/40 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400",
    },
    "pending-pairing": {
      icon: <ShieldCheck size={14} className="animate-pulse" />,
      label: "Awaiting pairing approval…",
      color: "border-blue-500/40 bg-blue-500/5 text-blue-600 dark:text-blue-400",
    },
  };

  const c = config[status];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
        c.color
      )}
    >
      {c.icon}
      {c.label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton placeholder for loading widget content
// ---------------------------------------------------------------------------

function WidgetSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2.5 rounded bg-muted animate-pulse",
            i === 0 ? "w-3/4" : i === lines - 1 ? "w-1/2" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pairing Approval Overlay – shown on widget content when pending pairing
// ---------------------------------------------------------------------------

function PairingApprovalOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 backdrop-blur-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
        <ShieldAlert size={20} className="text-blue-500 animate-pulse" />
      </div>
      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
        Waiting for admin approval
      </p>
      <p className="text-xs text-muted-foreground max-w-[200px] text-center">
        An operator must approve this device before data is available
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Widget Card wrapper (shared styling)
// ---------------------------------------------------------------------------

interface WidgetCardProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  /** Tailwind col-span classes for mixed sizing */
  className?: string;
  children: React.ReactNode;
  /** Optional accent color for the icon background */
  iconColor?: string;
  /** When true, overlays a "Waiting for admin approval" banner on the card content */
  showPairingOverlay?: boolean;
}

function WidgetCard({
  title,
  description,
  icon,
  className,
  children,
  iconColor = "bg-primary/10 text-primary",
  showPairingOverlay = false,
}: WidgetCardProps) {
  return (
    <Card
      className={cn(
        "transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              iconColor
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && (
              <CardDescription className="text-xs truncate">
                {description}
              </CardDescription>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {children}
        {showPairingOverlay && <PairingApprovalOverlay />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Individual Widget Renderers
// ---------------------------------------------------------------------------

// AlertBannersWidget — replaced by standalone AlertBanners from ./alert-banners

// ---------------------------------------------------------------------------
// Full-width Alert Banners (positioned above the widget grid)
// ---------------------------------------------------------------------------

/**
 * AlertBannersSection renders the Alert Banners widget full-width above the
 * main dashboard grid. It is wired to the real-time alerts data stream from
 * the gateway WebSocket (alert.new, alert.resolved, alerts.snapshot events).
 *
 * When there are no alerts AND data has loaded, the section collapses to a
 * minimal "No active alerts" indicator to avoid wasting vertical space.
 * When data is still loading (undefined), it shows skeleton placeholders.
 * When pairing is pending, it shows the pairing overlay.
 */
function AlertBannersSection({
  data,
  showPairingOverlay,
}: {
  data?: AlertData[];
  showPairingOverlay?: boolean;
}) {
  return (
    <WidgetCard
      title="Alert Banners"
      description="Active alerts & notifications"
      icon={<AlertTriangle size={16} />}
      iconColor="bg-red-500/10 text-red-500"
      className="w-full"
      showPairingOverlay={showPairingOverlay}
    >
      <AlertBanners data={data} />
    </WidgetCard>
  );
}

function SystemHealthWidget({ data }: { data?: SystemHealthData }) {
  return <SystemHealthCard data={data} />;
}

// CostTrackingWidget replaced by standalone CostTrackingCard from ./cost-tracking-card
// TokenUsageWidget replaced by TokenUsageAnalytics from ./token-usage-analytics

function ActiveSessionsWidget({ data }: { data?: ActiveSessionsData }) {
  return <ActiveSessionsCard data={data} />;
}

function ChartsTrendsWidget({ data }: { data?: ChartsTrendsData }) {
  return <ChartsTrendsCard data={data} />;
}

// ---------------------------------------------------------------------------
// Main Dashboard Grid
// ---------------------------------------------------------------------------

export function MonitoringDashboard({
  connectionStatus = "disconnected",
  scopes = [],
  onRefresh,
  isRefreshing = false,
  onTokenRefresh,
  isTokenRefreshing = false,
  sendRequest,
  addGatewayEventListener,
  removeGatewayEventListener,
  isGatewayConnected = false,
  alerts,
  systemHealth,
  costTracking,
  tokenUsage,
  activeSessions,
  chartsTrends,
  pairingRequests,
  onApprovePairing,
  onRejectPairing,
}: MonitoringDashboardProps) {
  const isPendingPairing = connectionStatus === "pending-pairing";
  const hasPairingScope = scopes.includes("operator.pairing");

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Dashboard Overview
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              System health and metrics at a glance
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isRefreshing || connectionStatus !== "connected"}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium",
              "transition-all duration-200 hover:bg-muted",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw
              size={13}
              className={cn(isRefreshing && "animate-spin")}
            />
            Refresh
          </button>
        </div>

        {/* Connection status banner */}
        <ConnectionBanner status={connectionStatus} />

        {/* 1. Alert Banners — full-width above the widget grid */}
        <AlertBannersSection
          data={alerts}
          showPairingOverlay={isPendingPairing}
        />

        {/* ================================================================
            RESPONSIVE GRID WITH MIXED CARD SIZES

            Layout breakdown:
            ┌─────────────────────────────────────────────────────┐
            │  xl (≥1280px): 3 columns                           │
            │  Row 1: [System Health] [Cost] [Tokens]            │
            │  Row 2: [Sessions] [Charts/Trends (2-col)]         │
            ├─────────────────────────────────────────────────────┤
            │  md (≥768px): 2 columns                            │
            │  Row 1: [System Health] [Cost]                     │
            │  Row 2: [Tokens] [Sessions]                        │
            │  Row 3: [Charts/Trends (2-col)]                    │
            ├─────────────────────────────────────────────────────┤
            │  sm (<768px): 1 column – all cards stack           │
            └─────────────────────────────────────────────────────┘
            ================================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* 2. System Health — single col */}
          <WidgetCard
            title="System Health"
            description="Gateway & service status"
            icon={<Activity size={16} />}
            iconColor="bg-emerald-500/10 text-emerald-500"
            className="col-span-1"
            showPairingOverlay={isPendingPairing}
          >
            <SystemHealthWidget data={systemHealth} />
          </WidgetCard>

          {/* 3. Cost Tracking — standalone card with Refresh + error/loading */}
          <CostTrackingCard
            data={costTracking}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            className="col-span-1"
            showPairingOverlay={isPendingPairing}
          />

          {/* 4. Token Usage Analytics — single col */}
          <WidgetCard
            title="Token Usage"
            description="Prompt & completion analytics"
            icon={<BarChart3 size={16} />}
            iconColor="bg-violet-500/10 text-violet-500"
            className="col-span-1"
            showPairingOverlay={isPendingPairing}
          >
            <TokenUsageAnalytics
              data={tokenUsage as TokenUsageAnalyticsData | undefined}
              onRefresh={onTokenRefresh}
              isRefreshing={isTokenRefreshing}
            />
          </WidgetCard>

          {/* 5. Active Sessions — single col */}
          <WidgetCard
            title="Active Sessions"
            description="Current agent sessions"
            icon={<Users size={16} />}
            iconColor="bg-blue-500/10 text-blue-500"
            className="col-span-1"
            showPairingOverlay={isPendingPairing}
          >
            <ActiveSessionsWidget data={activeSessions} />
          </WidgetCard>

          {/* Pairing Approval — only visible when operator.pairing scope is granted */}
          {hasPairingScope && sendRequest && addGatewayEventListener && removeGatewayEventListener && (
            <PairingApprovalPanel
              sendRequest={sendRequest}
              addEventListener={addGatewayEventListener}
              removeEventListener={removeGatewayEventListener}
              isConnected={isGatewayConnected}
              className="md:col-span-2 xl:col-span-1"
              pairingRequests={pairingRequests}
              onApprovePairing={onApprovePairing}
              onRejectPairing={onRejectPairing}
            />
          )}

          {/* 6. Charts & Trends — full-width span for the chart area */}
          <WidgetCard
            title="Charts & Trends"
            description="Usage patterns over time"
            icon={<TrendingUp size={16} />}
            iconColor="bg-cyan-500/10 text-cyan-500"
            className="md:col-span-2 xl:col-span-3"
            showPairingOverlay={isPendingPairing}
          >
            <ChartsTrendsWidget data={chartsTrends} />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
