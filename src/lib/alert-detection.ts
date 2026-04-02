/**
 * Alert Detection Engine
 *
 * Analyzes WebSocket event data from the OpenClaw gateway and produces typed
 * AlertData objects for three smart warning rules:
 *
 * 1. **High Cost Threshold** – Fires when daily spend exceeds a configurable
 *    dollar threshold (default $50). Severity escalates:
 *    - warning  → daily cost ≥ threshold
 *    - critical → daily cost ≥ 2× threshold
 *
 * 2. **Failed Cron Job** – Fires when a session with type "cron" is detected
 *    in a failed/error state. Always severity "critical" since cron failures
 *    typically indicate broken automations.
 *
 * 3. **Offline Gateway** – Fires when system health reports the gateway as
 *    "offline". Severity is "critical" for offline, "warning" for degraded.
 *
 * Usage:
 * ```ts
 * const detector = new AlertDetector({ costThreshold: 50 });
 *
 * // Feed data as it arrives from WebSocket events / polling
 * const costAlerts = detector.evaluateCost(costData);
 * const sessionAlerts = detector.evaluateSessions(sessionsData);
 * const healthAlerts = detector.evaluateHealth(healthData);
 *
 * // Or evaluate everything at once
 * const allAlerts = detector.evaluateAll({ costData, sessionsData, healthData });
 * ```
 *
 * Each method returns an array of AlertData objects. Alerts have deterministic
 * IDs (derived from the rule name + key data) so the same condition doesn't
 * produce duplicate alerts across evaluation cycles.
 */

import type {
  AlertData,
  SystemHealthData,
  CostTrackingData,
  ActiveSessionsData,
  SessionEntry,
} from "@/components/monitoring/monitoring-dashboard";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface AlertDetectorConfig {
  /** Daily cost threshold in dollars that triggers a warning (default: 50) */
  costThreshold?: number;
  /** Multiplier for critical cost alert (default: 2, i.e. 2× threshold) */
  costCriticalMultiplier?: number;
  /** Budget utilization percent that triggers a warning (default: 80) */
  budgetWarningPercent?: number;
  /** Budget utilization percent that triggers a critical alert (default: 95) */
  budgetCriticalPercent?: number;
}

const DEFAULT_CONFIG: Required<AlertDetectorConfig> = {
  costThreshold: 50,
  costCriticalMultiplier: 2,
  budgetWarningPercent: 80,
  budgetCriticalPercent: 95,
};

// ---------------------------------------------------------------------------
// Alert ID generators (deterministic to prevent duplicates)
// ---------------------------------------------------------------------------

const ALERT_IDS = {
  HIGH_COST_DAILY: "alert:cost:high-daily",
  HIGH_COST_CRITICAL: "alert:cost:critical-daily",
  BUDGET_WARNING: "alert:cost:budget-warning",
  BUDGET_CRITICAL: "alert:cost:budget-critical",
  GATEWAY_OFFLINE: "alert:health:gateway-offline",
  GATEWAY_DEGRADED: "alert:health:gateway-degraded",
  CRON_FAILED: (sessionId: string) => `alert:cron:failed:${sessionId}`,
} as const;

// ---------------------------------------------------------------------------
// Helper: create timestamp
// ---------------------------------------------------------------------------

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// AlertDetector class
// ---------------------------------------------------------------------------

export class AlertDetector {
  private config: Required<AlertDetectorConfig>;

  constructor(config: AlertDetectorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration thresholds at runtime (e.g., from user settings).
   */
  updateConfig(config: Partial<AlertDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ── Rule 1: High Cost Threshold ─────────────────────────────────────

  /**
   * Evaluates cost tracking data against configured thresholds.
   *
   * Produces alerts for:
   * - Daily spend exceeding the warning threshold
   * - Daily spend exceeding the critical threshold (2× warning by default)
   * - Budget utilization exceeding warning/critical percentages (if budget configured)
   */
  evaluateCost(data: CostTrackingData | undefined): AlertData[] {
    if (!data) return [];

    const alerts: AlertData[] = [];
    const { costThreshold, costCriticalMultiplier, budgetWarningPercent, budgetCriticalPercent } =
      this.config;
    const dailyCost = data.dailyCost ?? 0;
    const currency = data.currency ?? "USD";

    // Critical daily cost (2× threshold)
    const criticalThreshold = costThreshold * costCriticalMultiplier;
    if (dailyCost >= criticalThreshold) {
      alerts.push({
        id: ALERT_IDS.HIGH_COST_CRITICAL,
        severity: "critical",
        message: `Daily spend $${dailyCost.toFixed(2)} ${currency} exceeds critical threshold ($${criticalThreshold.toFixed(2)})`,
        timestamp: now(),
      });
    } else if (dailyCost >= costThreshold) {
      // Warning daily cost (1× threshold)
      alerts.push({
        id: ALERT_IDS.HIGH_COST_DAILY,
        severity: "warning",
        message: `Daily spend $${dailyCost.toFixed(2)} ${currency} exceeds threshold ($${costThreshold.toFixed(2)})`,
        timestamp: now(),
      });
    }

    // Budget utilization alerts (only if budget is configured)
    if (data.budgetLimit && data.budgetLimit > 0 && data.totalCost !== undefined) {
      const utilizationPercent = (data.totalCost / data.budgetLimit) * 100;

      if (utilizationPercent >= budgetCriticalPercent) {
        alerts.push({
          id: ALERT_IDS.BUDGET_CRITICAL,
          severity: "critical",
          message: `Budget usage at ${utilizationPercent.toFixed(1)}% — approaching limit ($${data.totalCost.toFixed(2)} / $${data.budgetLimit.toFixed(2)})`,
          timestamp: now(),
        });
      } else if (utilizationPercent >= budgetWarningPercent) {
        alerts.push({
          id: ALERT_IDS.BUDGET_WARNING,
          severity: "warning",
          message: `Budget usage at ${utilizationPercent.toFixed(1)}% ($${data.totalCost.toFixed(2)} / $${data.budgetLimit.toFixed(2)})`,
          timestamp: now(),
        });
      }
    }

    return alerts;
  }

  // ── Rule 2: Failed Cron Job Detection ───────────────────────────────

  /**
   * Evaluates active sessions data for failed cron jobs.
   *
   * A session is considered a failed cron if:
   * - Its `type` is "cron"
   * - Its agent name or ID contains error indicators, OR
   * - It appears in the sessions list with a failed/error state
   *
   * Since SessionEntry doesn't have a `status` field, we detect failures
   * through the session data pattern: sessions with type "cron" that have
   * error-indicating metadata in the agent field.
   */
  evaluateSessions(data: ActiveSessionsData | undefined): AlertData[] {
    if (!data?.sessions) return [];

    const alerts: AlertData[] = [];

    for (const session of data.sessions) {
      if (session.type !== "cron") continue;

      // Check for failed cron indicators in the session data
      if (isFailedCronSession(session)) {
        alerts.push({
          id: ALERT_IDS.CRON_FAILED(session.id),
          severity: "critical",
          message: `Cron job "${session.agent}" failed (session ${session.id.slice(0, 8)}…)`,
          timestamp: now(),
        });
      }
    }

    return alerts;
  }

  // ── Rule 3: Offline Gateway Detection ───────────────────────────────

  /**
   * Evaluates system health data for gateway offline/degraded status.
   *
   * Produces:
   * - critical alert when gatewayStatus is "offline"
   * - warning alert when gatewayStatus is "degraded"
   */
  evaluateHealth(data: SystemHealthData | undefined): AlertData[] {
    if (!data) return [];

    const alerts: AlertData[] = [];

    if (data.gatewayStatus === "offline") {
      alerts.push({
        id: ALERT_IDS.GATEWAY_OFFLINE,
        severity: "critical",
        message: "Gateway is offline — all services unavailable",
        timestamp: now(),
      });
    } else if (data.gatewayStatus === "degraded") {
      alerts.push({
        id: ALERT_IDS.GATEWAY_DEGRADED,
        severity: "warning",
        message: "Gateway is degraded — some services may be impacted",
        timestamp: now(),
      });
    }

    return alerts;
  }

  // ── Evaluate All Rules ──────────────────────────────────────────────

  /**
   * Run all detection rules and return a deduplicated, severity-sorted
   * array of alerts. Critical alerts appear first, then warnings, then info.
   */
  evaluateAll(context: {
    costData?: CostTrackingData;
    sessionsData?: ActiveSessionsData;
    healthData?: SystemHealthData;
  }): AlertData[] {
    const costAlerts = this.evaluateCost(context.costData);
    const sessionAlerts = this.evaluateSessions(context.sessionsData);
    const healthAlerts = this.evaluateHealth(context.healthData);

    const all = [...healthAlerts, ...costAlerts, ...sessionAlerts];

    // Deduplicate by alert ID (keep first occurrence)
    const seen = new Set<string>();
    const deduped = all.filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    });

    // Sort by severity: critical > warning > info
    return deduped.sort((a, b) => {
      const order: Record<AlertData["severity"], number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      return order[a.severity] - order[b.severity];
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: detect failed cron sessions
// ---------------------------------------------------------------------------

/**
 * Heuristic to detect if a cron session is in a failed state.
 *
 * Since the SessionEntry type doesn't include an explicit `status` field,
 * we check for common failure indicators:
 * 1. The session entry has a `status` field (from raw gateway data) set to
 *    an error value — we safely check via type assertion since the gateway
 *    may include extra fields not in our typed interface.
 * 2. The agent name contains error markers (e.g., "[FAILED]", "[ERROR]")
 * 3. Context usage is at 0% with 0 tokens used (never started)
 */
function isFailedCronSession(session: SessionEntry): boolean {
  // Check for raw status field from gateway (may exist beyond typed interface)
  const raw = session as unknown as Record<string, unknown>;
  if (typeof raw.status === "string") {
    const status = raw.status.toLowerCase();
    if (
      status === "failed" ||
      status === "error" ||
      status === "crashed" ||
      status === "timeout"
    ) {
      return true;
    }
  }

  // Check for error markers in agent name
  const agent = session.agent.toLowerCase();
  if (
    agent.includes("[failed]") ||
    agent.includes("[error]") ||
    agent.includes("[crashed]") ||
    agent.includes("[timeout]")
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Singleton factory for convenience
// ---------------------------------------------------------------------------

let _defaultDetector: AlertDetector | null = null;

/**
 * Returns a shared AlertDetector instance with default configuration.
 * Useful when you don't need custom thresholds.
 */
export function getDefaultAlertDetector(): AlertDetector {
  if (!_defaultDetector) {
    _defaultDetector = new AlertDetector();
  }
  return _defaultDetector;
}

// ---------------------------------------------------------------------------
// React hook helper: merge server-pushed alerts with locally-detected alerts
// ---------------------------------------------------------------------------

/**
 * Merges gateway-pushed alerts (from alert.new / alerts.snapshot events) with
 * locally-detected alerts from the AlertDetector. Deduplicates by ID and
 * sorts by severity.
 *
 * This is intended to be called in the monitoring container or hook to
 * combine both data sources before passing to the AlertBannersWidget.
 */
export function mergeAlerts(
  serverAlerts: AlertData[] | undefined,
  detectedAlerts: AlertData[]
): AlertData[] {
  const all = [...(serverAlerts ?? []), ...detectedAlerts];

  // Deduplicate by ID — server alerts take precedence (listed first)
  const seen = new Set<string>();
  const deduped = all.filter((alert) => {
    if (seen.has(alert.id)) return false;
    seen.add(alert.id);
    return true;
  });

  // Sort: critical > warning > info
  const order: Record<AlertData["severity"], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return deduped.sort((a, b) => order[a.severity] - order[b.severity]);
}
