"use client";

/**
 * PairingApprovalPanel – Container component for the operator pairing admin area.
 *
 * Responsibilities:
 * - Fetches pending pairing requests via the `listPendingPairings` JSON-RPC method
 * - Manages the list state (loading, error, empty, populated)
 * - Handles approve/reject actions via `approvePairing` / `rejectPairing` JSON-RPC
 * - Subscribes to `pairing.request` push events for real-time new requests
 * - Auto-refreshes the list on mount and when new pairing events arrive
 * - Only renders when the user has the `operator.pairing` scope (enforced by parent)
 *
 * Supports two modes:
 * 1. **Centralized** (preferred): When `pairingRequests`, `onApprovePairing`,
 *    `onRejectPairing` are provided (from useGatewayMonitor), the panel uses
 *    those directly. Fetch/event management is handled by the hook.
 * 2. **Self-managed**: When centralized props are not provided, the panel
 *    fetches via `sendRequest` and subscribes to events itself.
 *
 * Uses PairingRequestCard to render each individual pending request.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  RefreshCw,
  Inbox,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  PairingRequestCard,
  type PairingRequest,
} from "./pairing-request-card";
import type { GatewayResponse, GatewayEvent } from "@/lib/gateway-types";

// ---------------------------------------------------------------------------
// JSON-RPC method names for pairing operations
// ---------------------------------------------------------------------------

const METHODS = {
  LIST: "listPendingPairings",
  APPROVE: "approvePairing",
  REJECT: "rejectPairing",
} as const;

/** Push event type for new pairing requests arriving in real-time */
const PAIRING_REQUEST_EVENT = "pairing.request";
/** Push event type for pairing resolution (approved/rejected by another operator) */
const PAIRING_RESOLVED_EVENT = "pairing.resolved";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PairingApprovalPanelProps {
  /**
   * Send a JSON-RPC request to the gateway.
   * Provided by the parent container (from useGatewayMonitor).
   */
  sendRequest: (
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<GatewayResponse>;

  /**
   * Subscribe to gateway push events.
   * Provided by the parent container (from useGatewayMonitor).
   */
  addEventListener: (type: string, listener: (event: GatewayEvent) => void) => void;

  /**
   * Unsubscribe from gateway push events.
   * Provided by the parent container (from useGatewayMonitor).
   */
  removeEventListener: (type: string, listener: (event: GatewayEvent) => void) => void;

  /** Whether the gateway connection is fully authenticated */
  isConnected: boolean;

  /** Additional className for the outer card */
  className?: string;

  // --- Centralized pairing data from useGatewayMonitor ---
  // When provided, the panel uses these instead of managing its own state.

  /**
   * Pre-fetched pairing requests from useGatewayMonitor.
   * When provided, the panel skips its own fetch and event subscriptions.
   */
  pairingRequests?: PairingRequest[];

  /**
   * Centralized approve handler from useGatewayMonitor.
   * Sends "pairing.approve" JSON-RPC with optimistic UI.
   */
  onApprovePairing?: (requestId: string) => Promise<void>;

  /**
   * Centralized reject handler from useGatewayMonitor.
   * Sends "pairing.reject" JSON-RPC with optimistic UI.
   */
  onRejectPairing?: (requestId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses the raw JSON-RPC response from `listPendingPairings` into typed
 * PairingRequest objects. The gateway response is expected to contain either:
 * - `{ requests: PairingRequest[] }` — array of pending requests
 * - `{ pairings: PairingRequest[] }` — alternative field name
 *
 * We normalize both forms and map field names to match PairingRequestCard's
 * expected interface (deviceName, publicKeyFingerprint, etc.)
 */
function parsePairingRequests(
  result: Record<string, unknown>
): PairingRequest[] {
  const raw =
    (result.requests as unknown[]) ??
    (result.pairings as unknown[]) ??
    [];

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item): PairingRequest | null => {
      if (!item || typeof item !== "object") return null;
      const r = item as Record<string, unknown>;

      const id = (r.id ?? r.requestId ?? r.deviceId ?? "") as string;
      if (!id) return null;

      return {
        id,
        deviceName:
          (r.deviceName as string) ??
          (r.label as string) ??
          (r.name as string) ??
          `Device ${(id as string).slice(0, 8)}`,
        publicKeyFingerprint:
          (r.publicKeyFingerprint as string) ??
          (r.publicKey as string) ??
          (r.fingerprint as string) ??
          "",
        requestedAt:
          (r.requestedAt as string) ??
          (r.createdAt as string) ??
          (r.timestamp as string) ??
          new Date().toISOString(),
        metadata: r.metadata as PairingRequest["metadata"],
      };
    })
    .filter((r): r is PairingRequest => r !== null);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PairingApprovalPanel({
  sendRequest,
  addEventListener,
  removeEventListener,
  isConnected,
  className,
  pairingRequests: externalRequests,
  onApprovePairing,
  onRejectPairing,
}: PairingApprovalPanelProps) {
  // Determine if we're using centralized mode (data from hook) or self-managed mode
  const useCentralized =
    externalRequests !== undefined &&
    onApprovePairing !== undefined &&
    onRejectPairing !== undefined;

  // ── Self-managed state (only used when centralized props are not provided) ──
  const [localRequests, setLocalRequests] = useState<PairingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // The effective list to render
  const requests = useCentralized ? (externalRequests ?? []) : localRequests;

  // ── Fetch pending pairing requests (self-managed mode) ─────────────────

  const fetchPendingRequests = useCallback(async () => {
    if (!isConnected || useCentralized) return;

    try {
      const response = await sendRequest(METHODS.LIST, {}, 10_000);

      if (!mountedRef.current) return;

      if (response.ok && response.result) {
        const parsed = parsePairingRequests(response.result);
        setLocalRequests(parsed);
        setError(null);
      } else {
        setError(response.error?.message ?? "Failed to fetch pairing requests");
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err instanceof Error ? err.message : "Failed to fetch pairing requests"
      );
    }
  }, [isConnected, sendRequest, useCentralized]);

  // ── Initial load + re-fetch on connection change (self-managed mode) ──

  useEffect(() => {
    if (useCentralized) return;

    mountedRef.current = true;

    if (isConnected) {
      setIsLoading(true);
      fetchPendingRequests().finally(() => {
        if (mountedRef.current) setIsLoading(false);
      });
    } else {
      setLocalRequests([]);
      setError(null);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isConnected, fetchPendingRequests, useCentralized]);

  // ── Subscribe to real-time pairing events (self-managed mode) ─────────

  useEffect(() => {
    if (useCentralized || !isConnected) return;

    const handlePairingRequest = (event: GatewayEvent) => {
      const data = event.data;
      if (data && typeof data === "object" && data.id) {
        const newReq: PairingRequest = {
          id: (data.id as string) ?? "",
          deviceName:
            (data.deviceName as string) ??
            (data.label as string) ??
            `Device ${((data.id as string) ?? "").slice(0, 8)}`,
          publicKeyFingerprint:
            (data.publicKeyFingerprint as string) ??
            (data.publicKey as string) ??
            "",
          requestedAt:
            (data.requestedAt as string) ??
            (data.timestamp as string) ??
            new Date().toISOString(),
          metadata: data.metadata as PairingRequest["metadata"],
        };
        setLocalRequests((prev) => {
          if (prev.some((r) => r.id === newReq.id)) return prev;
          return [newReq, ...prev];
        });
      } else {
        fetchPendingRequests();
      }
    };

    const handlePairingResolved = (event: GatewayEvent) => {
      const resolvedId = (event.data?.id ?? event.data?.requestId) as string;
      if (resolvedId) {
        setLocalRequests((prev) => prev.filter((r) => r.id !== resolvedId));
      } else {
        fetchPendingRequests();
      }
    };

    addEventListener(PAIRING_REQUEST_EVENT, handlePairingRequest);
    addEventListener(PAIRING_RESOLVED_EVENT, handlePairingResolved);

    return () => {
      removeEventListener(PAIRING_REQUEST_EVENT, handlePairingRequest);
      removeEventListener(PAIRING_RESOLVED_EVENT, handlePairingResolved);
    };
  }, [useCentralized, isConnected, addEventListener, removeEventListener, fetchPendingRequests]);

  // ── Approve / Reject handlers ─────────────────────────────────────────

  const handleApprove = useCallback(
    async (requestId: string) => {
      if (useCentralized && onApprovePairing) {
        return onApprovePairing(requestId);
      }
      // Self-managed fallback
      const response = await sendRequest(METHODS.APPROVE, { requestId });
      if (!response.ok) {
        throw new Error(response.error?.message ?? "Approval failed");
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== requestId));
    },
    [useCentralized, onApprovePairing, sendRequest]
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      if (useCentralized && onRejectPairing) {
        return onRejectPairing(requestId);
      }
      // Self-managed fallback
      const response = await sendRequest(METHODS.REJECT, { requestId });
      if (!response.ok) {
        throw new Error(response.error?.message ?? "Rejection failed");
      }
      setLocalRequests((prev) => prev.filter((r) => r.id !== requestId));
    },
    [useCentralized, onRejectPairing, sendRequest]
  );

  // ── Manual refresh ────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchPendingRequests();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  }, [fetchPendingRequests, isRefreshing]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Card
      className={cn(
        "transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <ShieldCheck size={16} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm">Pairing Approval</CardTitle>
              <CardDescription className="text-xs truncate">
                Pending device pairing requests
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {requests.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-bold text-amber-500">
                {requests.length}
              </span>
            )}
            {!useCentralized && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={handleRefresh}
                disabled={isRefreshing || !isConnected}
                title="Refresh pending requests"
              >
                <RefreshCw
                  size={13}
                  className={cn(isRefreshing && "animate-spin")}
                />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Loading state (self-managed mode only) */}
        {!useCentralized && isLoading && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-xs">Loading pairing requests…</p>
          </div>
        )}

        {/* Error state (self-managed mode only) */}
        {!useCentralized && error && !isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && requests.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/50">
              <Inbox size={18} />
            </div>
            <p className="text-xs">No pending pairing requests</p>
          </div>
        )}

        {/* Request list */}
        {requests.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {requests.map((request) => (
              <PairingRequestCard
                key={request.id}
                request={request}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}

        {/* Disconnected state */}
        {!isConnected && !isLoading && requests.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/30 px-3 py-2 text-xs text-muted-foreground mt-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>Connect to gateway to manage pairing requests</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
