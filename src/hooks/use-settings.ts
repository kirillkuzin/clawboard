"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_GATEWAY_URL = "clawboard_gateway_ws_url";
const STORAGE_KEY_GATEWAY_TOKEN = "clawboard_gateway_token";
const DEFAULT_GATEWAY_URL =
  process.env.NEXT_PUBLIC_OPENCLAW_GATEWAY_WS_URL || "ws://localhost:18789";

/** All localStorage keys managed by the settings system */
export const SETTINGS_STORAGE_KEYS = {
  gatewayUrl: STORAGE_KEY_GATEWAY_URL,
  gatewayToken: STORAGE_KEY_GATEWAY_TOKEN,
  theme: "clawboard-theme",
  sidebarPinned: "clawboard-sidebar-pinned",
  sidebarActive: "clawboard-sidebar-active",
} as const;

export interface Settings {
  gatewayUrl: string;
  gatewayToken: string;
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
  const [gatewayToken, setGatewayTokenState] = useState<string>("");
  // Password is kept in memory only — not persisted to localStorage
  const [gatewayPassword, setGatewayPassword] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const storedUrl =
        localStorage.getItem(STORAGE_KEY_GATEWAY_URL) || DEFAULT_GATEWAY_URL;
      const storedToken =
        localStorage.getItem(STORAGE_KEY_GATEWAY_TOKEN) || "";
      setGatewayUrlState(storedUrl);
      setGatewayTokenState(storedToken);
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
      if (e.key === STORAGE_KEY_GATEWAY_TOKEN) {
        setGatewayTokenState(e.newValue || "");
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const setGatewayUrl = useCallback((value: string) => {
    setGatewayUrlState(value);
    try { localStorage.setItem(STORAGE_KEY_GATEWAY_URL, value); } catch {}
  }, []);

  const setGatewayToken = useCallback((value: string) => {
    setGatewayTokenState(value);
    try { localStorage.setItem(STORAGE_KEY_GATEWAY_TOKEN, value); } catch {}
  }, []);

  const clearSettings = useCallback(() => {
    setGatewayUrlState(DEFAULT_GATEWAY_URL);
    setGatewayTokenState("");
    setGatewayPassword("");
    try {
      localStorage.removeItem(STORAGE_KEY_GATEWAY_URL);
      localStorage.removeItem(STORAGE_KEY_GATEWAY_TOKEN);
      localStorage.removeItem("clawboard_api_key");
      localStorage.removeItem("clawboard_api_url");
    } catch {}
  }, []);

  return {
    gatewayUrl,
    gatewayWsUrl: gatewayUrl,
    gatewayToken,
    gatewayPassword,
    setGatewayUrl,
    setGatewayWsUrl: setGatewayUrl,
    setGatewayToken,
    setGatewayPassword,
    clearSettings,
    isLoaded,
    defaultGatewayUrl: DEFAULT_GATEWAY_URL,
    defaultGatewayWsUrl: DEFAULT_GATEWAY_URL,
  };
}
