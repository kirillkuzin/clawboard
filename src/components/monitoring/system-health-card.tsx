"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Server, Clock, Cpu, HardDrive, MemoryStick } from "lucide-react";
import type { SystemHealthData, ResourceMetric } from "./monitoring-dashboard";

// ---------------------------------------------------------------------------
// Gauge Meter Component
// ---------------------------------------------------------------------------

const gaugeColors = {
  low: {
    bar: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  medium: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  high: {
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
};

function getGaugeLevel(percent: number): "low" | "medium" | "high" {
  if (percent >= 90) return "high";
  if (percent >= 70) return "medium";
  return "low";
}

function formatMetricValue(value: number | undefined, unit: string | undefined): string {
  if (value === undefined) return "—";
  return unit ? `${value} ${unit}` : `${value}`;
}

interface GaugeMeterProps {
  label: string;
  icon: React.ReactNode;
  metric?: ResourceMetric;
}

function GaugeMeter({ label, icon, metric }: GaugeMeterProps) {
  if (!metric) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="h-2 rounded-full bg-muted animate-pulse" />
        <div className="h-3 w-8 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const level = getGaugeLevel(metric.percent);
  const colors = gaugeColors[level];
  const clampedPercent = Math.min(100, Math.max(0, metric.percent));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <span className={cn("text-xs font-semibold tabular-nums", colors.text)}>
          {clampedPercent.toFixed(0)}%
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colors.bar
          )}
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      {/* Used / Total label */}
      {(metric.used !== undefined || metric.total !== undefined) && (
        <p className="text-[10px] text-muted-foreground tabular-nums">
          {formatMetricValue(metric.used, metric.unit)} / {formatMetricValue(metric.total, metric.unit)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SystemHealthSkeleton() {
  return (
    <div className="space-y-4">
      {/* Status skeleton */}
      <div className="flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-muted animate-pulse" />
        <div className="h-3 w-16 rounded bg-muted animate-pulse" />
        <div className="ml-auto h-3 w-24 rounded bg-muted animate-pulse" />
      </div>
      {/* Gauge skeletons */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
            <div className="h-2 rounded-full bg-muted animate-pulse" />
            <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status Configuration
// ---------------------------------------------------------------------------

const statusConfig = {
  healthy: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    label: "Healthy",
    pulse: "",
    dotShadow: "shadow-emerald-500/50",
  },
  degraded: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    label: "Degraded",
    pulse: "animate-pulse",
    dotShadow: "shadow-amber-500/50",
  },
  down: {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    label: "Down",
    pulse: "animate-pulse",
    dotShadow: "shadow-red-500/50",
  },
};

const gatewayStatusConfig = {
  online: { dot: "bg-emerald-500", label: "Online" },
  degraded: { dot: "bg-amber-500", label: "Degraded" },
  offline: { dot: "bg-red-500", label: "Offline" },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface SystemHealthCardProps {
  data?: SystemHealthData;
}

export function SystemHealthCard({ data }: SystemHealthCardProps) {
  if (!data) return <SystemHealthSkeleton />;

  const sc = statusConfig[data.status];
  const gw = gatewayStatusConfig[data.gatewayStatus];

  return (
    <div className="space-y-4">
      {/* Gateway Status Row */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full shadow-sm",
            sc.dot,
            sc.dotShadow,
            sc.pulse
          )}
        />
        <span className={cn("text-sm font-semibold", sc.text)}>
          {sc.label}
        </span>
        {data.uptime && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Clock size={10} className="shrink-0" />
            {data.uptime}
          </span>
        )}
      </div>

      {/* Gateway indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md border border-border/50 px-2.5 py-1.5">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", gw.dot)} />
        <span>Gateway</span>
        <span className="ml-auto font-medium text-foreground">{gw.label}</span>
      </div>

      {/* Resource Gauges - 2x2 Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <GaugeMeter
          label="CPU"
          icon={<Cpu size={11} className="shrink-0" />}
          metric={data.cpu}
        />
        <GaugeMeter
          label="RAM"
          icon={<MemoryStick size={11} className="shrink-0" />}
          metric={data.ram}
        />
        <GaugeMeter
          label="Disk"
          icon={<HardDrive size={11} className="shrink-0" />}
          metric={data.disk}
        />
        <GaugeMeter
          label="Swap"
          icon={<Server size={11} className="shrink-0" />}
          metric={data.swap}
        />
      </div>

      {/* Service Status List */}
      {data.services && data.services.length > 0 && (
        <div className="border-t border-border/50 pt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
            Services
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {data.services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    svc.status === "up" ? "bg-emerald-500" : "bg-red-500"
                  )}
                />
                {svc.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock data for development / testing
// ---------------------------------------------------------------------------

export const MOCK_SYSTEM_HEALTH: SystemHealthData = {
  status: "healthy",
  gatewayStatus: "online",
  uptime: "3d 14h 22m",
  uptimeSeconds: 310920,
  cpu: { percent: 42, used: 4, total: 8, unit: "cores" },
  ram: { percent: 68, used: 10.9, total: 16, unit: "GB" },
  disk: { percent: 55, used: 110, total: 200, unit: "GB" },
  swap: { percent: 12, used: 0.5, total: 4, unit: "GB" },
  services: [
    { name: "Gateway", status: "up" },
    { name: "Auth", status: "up" },
    { name: "Scheduler", status: "up" },
    { name: "Worker Pool", status: "up" },
  ],
};

export const MOCK_SYSTEM_HEALTH_DEGRADED: SystemHealthData = {
  status: "degraded",
  gatewayStatus: "degraded",
  uptime: "0d 2h 15m",
  uptimeSeconds: 8100,
  cpu: { percent: 87, used: 7, total: 8, unit: "cores" },
  ram: { percent: 92, used: 14.7, total: 16, unit: "GB" },
  disk: { percent: 78, used: 156, total: 200, unit: "GB" },
  swap: { percent: 45, used: 1.8, total: 4, unit: "GB" },
  services: [
    { name: "Gateway", status: "up" },
    { name: "Auth", status: "up" },
    { name: "Scheduler", status: "down" },
    { name: "Worker Pool", status: "up" },
  ],
};

export const MOCK_SYSTEM_HEALTH_DOWN: SystemHealthData = {
  status: "down",
  gatewayStatus: "offline",
  services: [
    { name: "Gateway", status: "down" },
    { name: "Auth", status: "down" },
    { name: "Scheduler", status: "down" },
    { name: "Worker Pool", status: "down" },
  ],
};
