"use client";

import React, { createContext, useContext } from "react";
import {
  useGatewayMonitor,
  type UseGatewayMonitorReturn,
  type UseGatewayMonitorOptions,
} from "@/hooks/use-gateway-monitor";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const GatewayContext = createContext<UseGatewayMonitorReturn | null>(null);

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the gateway connection, sendRequest, widget data, and actions
 * from anywhere in the component tree below GatewayProvider.
 */
export function useGateway(): UseGatewayMonitorReturn {
  const ctx = useContext(GatewayContext);
  if (!ctx) {
    throw new Error("useGateway must be used within a GatewayProvider");
  }
  return ctx;
}

/**
 * Non-throwing variant: returns null when outside GatewayProvider.
 * Useful for components that can optionally use gateway data.
 */
export function useGatewayOptional(): UseGatewayMonitorReturn | null {
  return useContext(GatewayContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface GatewayProviderProps {
  children: React.ReactNode;
  options?: UseGatewayMonitorOptions;
}

export function GatewayProvider({ children, options }: GatewayProviderProps) {
  const gateway = useGatewayMonitor(options);

  return (
    <GatewayContext.Provider value={gateway}>{children}</GatewayContext.Provider>
  );
}
