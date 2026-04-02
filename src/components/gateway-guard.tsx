"use client";

import React from "react";
import { useGateway } from "@/components/providers/gateway-provider";
import { Loader2, WifiOff, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface GatewayGuardProps {
  children: React.ReactNode;
  /** Show a compact inline status instead of full-page */
  inline?: boolean;
}

/**
 * Renders children only when the gateway is authenticated.
 * Shows connection/auth status otherwise.
 */
export function GatewayGuard({ children, inline }: GatewayGuardProps) {
  const { isConnected, isConnecting, isPendingPairing, error } = useGateway();

  if (isConnected) {
    return <>{children}</>;
  }

  const wrapperClass = inline
    ? "flex items-center gap-2 p-3 text-sm text-muted-foreground"
    : "flex flex-col items-center justify-center gap-3 p-8 min-h-[200px]";

  if (isConnecting) {
    return (
      <div className={wrapperClass}>
        <Loader2
          size={inline ? 16 : 24}
          className="animate-spin text-primary"
        />
        <span>Connecting to OpenClaw gateway...</span>
      </div>
    );
  }

  if (isPendingPairing) {
    return (
      <div className={wrapperClass}>
        <KeyRound size={inline ? 16 : 24} className="text-amber-500" />
        <div className={cn(!inline && "text-center")}>
          <p className="font-medium text-foreground">Pairing required</p>
          <p className="text-sm text-muted-foreground">
            Approve this device in the OpenClaw operator panel
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <WifiOff size={inline ? 16 : 24} className="text-muted-foreground" />
      <div className={cn(!inline && "text-center")}>
        <p className="font-medium text-foreground">Not connected</p>
        <p className="text-sm text-muted-foreground">
          {error
            ? error
            : "Configure the Gateway WebSocket URL in Settings to connect"}
        </p>
      </div>
    </div>
  );
}
