"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Fingerprint,
  Monitor,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PairingRequest {
  /** Unique ID for this pairing request */
  id: string;
  /** Human-readable device name (e.g. "Alice's MacBook Pro") */
  deviceName: string;
  /** Hex-encoded Ed25519 public key fingerprint (truncated for display) */
  publicKeyFingerprint: string;
  /** ISO 8601 timestamp of when the request was created */
  requestedAt: string;
  /** Optional metadata about the requesting device */
  metadata?: {
    platform?: string;
    userAgent?: string;
  };
}

export interface PairingRequestCardProps {
  /** The pending pairing request to display */
  request: PairingRequest;
  /** Callback when the operator approves the request */
  onApprove?: (requestId: string) => Promise<void> | void;
  /** Callback when the operator rejects the request */
  onReject?: (requestId: string) => Promise<void> | void;
  /** Additional className for the outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a public key fingerprint for display.
 * Shows the first 8 and last 8 hex characters separated by "…"
 * e.g. "a1b2c3d4…e5f6g7h8"
 */
function formatFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 20) return fingerprint;
  return `${fingerprint.slice(0, 8)}…${fingerprint.slice(-8)}`;
}

/**
 * Formats a relative time string from an ISO timestamp.
 */
function formatRelativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  if (isNaN(then)) return "unknown";
  const diffMs = now - then;

  if (diffMs < 0) return "just now";
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `${mins}m ago`;
  }
  if (diffMs < 86_400_000) {
    const hours = Math.floor(diffMs / 3_600_000);
    return `${hours}h ago`;
  }
  const days = Math.floor(diffMs / 86_400_000);
  return `${days}d ago`;
}

/**
 * Formats an ISO timestamp into a local date/time string.
 */
function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PairingRequestCard({
  request,
  onApprove,
  onReject,
  className,
}: PairingRequestCardProps) {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [resolved, setResolved] = useState<"approved" | "rejected" | null>(null);

  const isActioning = approving || rejecting;

  const handleApprove = async () => {
    if (isActioning || resolved) return;
    setApproving(true);
    try {
      await onApprove?.(request.id);
      setResolved("approved");
    } catch (err) {
      console.error("[PairingRequestCard] Approve failed:", err);
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (isActioning || resolved) return;
    setRejecting(true);
    try {
      await onReject?.(request.id);
      setResolved("rejected");
    } catch (err) {
      console.error("[PairingRequestCard] Reject failed:", err);
    } finally {
      setRejecting(false);
    }
  };

  // After resolution, show a brief confirmation state
  if (resolved) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-3 text-xs",
          resolved === "approved"
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
            : "border-muted bg-muted/30 text-muted-foreground",
          className
        )}
      >
        {resolved === "approved" ? (
          <CheckCircle2 size={14} className="shrink-0" />
        ) : (
          <XCircle size={14} className="shrink-0" />
        )}
        <span className="font-medium">{request.deviceName}</span>
        <span>
          {resolved === "approved" ? "approved" : "rejected"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3",
        "transition-all duration-200",
        className
      )}
    >
      {/* Device info row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Monitor size={14} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {request.deviceName}
            </p>
            {request.metadata?.platform && (
              <p className="text-[10px] text-muted-foreground truncate">
                {request.metadata.platform}
              </p>
            )}
          </div>
        </div>
        <Badge variant="warning" className="shrink-0 text-[10px]">
          Pending
        </Badge>
      </div>

      {/* Key fingerprint */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Fingerprint size={12} className="shrink-0 text-blue-400" />
        <code className="font-mono text-[10px] bg-muted/50 rounded px-1.5 py-0.5 truncate">
          {formatFingerprint(request.publicKeyFingerprint)}
        </code>
      </div>

      {/* Timestamp */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Clock size={10} className="shrink-0" />
        <span title={formatTimestamp(request.requestedAt)}>
          Requested {formatRelativeTime(request.requestedAt)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="default"
          onClick={handleApprove}
          disabled={isActioning}
          className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {approving ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <CheckCircle2 size={12} />
          )}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={isActioning}
          className="flex-1 h-7 text-xs"
        >
          {rejecting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <XCircle size={12} />
          )}
          Reject
        </Button>
      </div>
    </div>
  );
}
