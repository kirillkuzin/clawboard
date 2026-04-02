"use client";

/**
 * Container component that wires the useGatewayMonitor hook to
 * the MonitoringDashboard presentational component.
 *
 * Responsibilities:
 * - Instantiates useGatewayMonitor (WebSocket connection, auth, polling)
 * - The hook internally fetches initial system health on authentication
 *   via "system.health" JSON-RPC request
 * - The hook subscribes to "health.update" push events for real-time
 *   updates, parsing them through parseHealthResponse for consistent typing
 * - Passes all widget data + connection state down to MonitoringDashboard
 * - Handles token-usage-specific refresh with time range parameter
 *
 * Data flow for System Health:
 * 1. On auth → hook calls fetchHealth() → system.health req → parseHealthResponse → setSystemHealth
 * 2. On push → hook dispatchEvent(health.update) → parseHealthResponse → setSystemHealth
 * 3. This container reads gateway.systemHealth and passes it to the dashboard
 *
 * Data flow for Token Usage:
 * 1. Polled every 30s via metrics.token_usage → setTokenUsage
 * 2. Push events via token_usage.update → setTokenUsage
 * 3. Manual refresh from widget Refresh button → sendRequest(metrics.token_usage, { timeRange })
 */

import React, { useState, useCallback } from "react";
import { MonitoringDashboard } from "./monitoring-dashboard";
import { useGatewayMonitor } from "@/hooks/use-gateway-monitor";
import type { TimeRange } from "./token-usage-analytics";

export function MonitoringDashboardContainer() {
  const gateway = useGatewayMonitor({
    autoConnect: true,
    pollIntervalMs: 30_000,
  });

  const [isTokenRefreshing, setIsTokenRefreshing] = useState(false);

  /**
   * Handle token usage refresh with optional time range.
   * Sends a JSON-RPC request to metrics.token_usage with the selected range,
   * then updates the token usage state via the hook's normal data flow.
   */
  const handleTokenRefresh = useCallback(
    async (timeRange: TimeRange) => {
      if (!gateway.isConnected || isTokenRefreshing) return;
      setIsTokenRefreshing(true);
      try {
        const res = await gateway.sendRequest("metrics.token_usage", {
          timeRange,
        });
        // The response is handled by the hook's polling data flow —
        // if the gateway responds with result data inline, we still
        // rely on the hook's setTokenUsage via the polling pipeline.
        // However for immediate feedback, we can also check the response:
        if (res.ok && res.result) {
          // Force-update is handled by the hook's internal state management
          // through the response correlation. No extra action needed.
        }
      } catch {
        // Silently handle — the gateway may not support time-range scoped queries
        // and will fall back to the next polling cycle.
      } finally {
        setIsTokenRefreshing(false);
      }
    },
    [gateway.isConnected, gateway.sendRequest, isTokenRefreshing]
  );

  return (
    <MonitoringDashboard
      connectionStatus={gateway.connectionStatus}
      scopes={gateway.scopes}
      onRefresh={gateway.refresh}
      isRefreshing={gateway.isRefreshing}
      onTokenRefresh={handleTokenRefresh}
      isTokenRefreshing={isTokenRefreshing}
      sendRequest={gateway.sendRequest}
      addGatewayEventListener={gateway.addEventListener}
      removeGatewayEventListener={gateway.removeEventListener}
      isGatewayConnected={gateway.isConnected}
      alerts={gateway.alerts}
      systemHealth={gateway.systemHealth}
      costTracking={gateway.costTracking}
      tokenUsage={gateway.tokenUsage}
      activeSessions={gateway.activeSessions}
      chartsTrends={gateway.chartsTrends}
      pairingRequests={gateway.pairingRequests}
      onApprovePairing={gateway.approvePairing}
      onRejectPairing={gateway.rejectPairing}
    />
  );
}
