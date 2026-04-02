"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_GATEWAY_URL = "clawboard_gateway_ws_url";
const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL || "ws://localhost:18789";

/** All localStorage keys managed by the settings system */
export const SETTINGS_STORAGE_KEYS = {
  gatewayUrl: STORAGE_KEY_GATEWAY_URL,
  theme: "clawboard-theme",
  sidebarPinned: "clawboard-sidebar-pinned",
  sidebarActive: "clawboard-sidebar-active",
} as const;

export interface Settings {
  gatewayUrl: string;
}

/**
 * Settings hook — manages the Gateway WebSocket URL.
 *
 * OpenClaw uses a single gateway server for all communication via
 * WebSocket JSON-RPC. Authentication is handled via Ed25519 device
 * identity (no API key needed).
 */
export function useSettings() {
  const [gatewayUrl, setGatewayUrlState] = useState<string>(DEFAULT_GATEWAY_URL);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored =
        localStorage.getItem(STORAGE_KEY_GATEWAY_URL) || DEFAULT_GATEWAY_URL;
      setGatewayUrlState(stored);
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
    setIsLoaded(true);
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_GATEWAY_URL) {
        setGatewayUrlState(e.newValue || DEFAULT_GATEWAY_URL);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const setGatewayUrl = useCallback((value: string) => {
    setGatewayUrlState(value);
    try {
      localStorage.setItem(STORAGE_KEY_GATEWAY_URL, value);
    } catch {
      // ignore
    }
  }, []);

  const clearSettings = useCallback(() => {
    setGatewayUrlState(DEFAULT_GATEWAY_URL);
    try {
      localStorage.removeItem(STORAGE_KEY_GATEWAY_URL);
      // Clean up legacy keys
      localStorage.removeItem("clawboard_api_key");
      localStorage.removeItem("clawboard_api_url");
    } catch {
      // ignore
    }
  }, []);

  // Backward compat: expose gatewayWsUrl as alias for code that still reads it
  return {
    gatewayUrl,
    /** @deprecated Use gatewayUrl instead */
    gatewayWsUrl: gatewayUrl,
    setGatewayUrl,
    /** @deprecated Use setGatewayUrl instead */
    setGatewayWsUrl: setGatewayUrl,
    clearSettings,
    isLoaded,
    defaultGatewayUrl: DEFAULT_GATEWAY_URL,
    /** @deprecated */
    defaultGatewayWsUrl: DEFAULT_GATEWAY_URL,
  };
}
