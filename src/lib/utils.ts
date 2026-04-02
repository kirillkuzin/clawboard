import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an ISO date string as a relative time (e.g., "5m ago", "2h ago").
 */
export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
  } catch {
    return iso ?? "—";
  }
}

/**
 * Safely convert an unknown value to a number, with a fallback.
 */
export function toNumber(val: unknown, fallback: number): number {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

/**
 * Safely convert an unknown value to a number, or null.
 */
export function toNumberOrNull(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (!isNaN(n)) return n;
  }
  return null;
}
