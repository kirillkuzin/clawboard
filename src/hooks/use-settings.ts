"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY_API_KEY = "clawboard_api_key";
const STORAGE_KEY_API_URL = "clawboard_api_url";
const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_OPENCLAW_API_URL || "http://localhost:8000";

/** All localStorage keys managed by the settings system */
export const SETTINGS_STORAGE_KEYS = {
  apiKey: STORAGE_KEY_API_KEY,
  apiUrl: STORAGE_KEY_API_URL,
  theme: "clawboard-theme",
  sidebarPinned: "clawboard-sidebar-pinned",
  sidebarActive: "clawboard-sidebar-active",
} as const;

export interface Settings {
  apiKey: string;
  apiUrl: string;
}

export function useSettings() {
  const [apiKey, setApiKeyState] = useState<string>("");
  const [apiUrl, setApiUrlState] = useState<string>(DEFAULT_API_URL);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const storedKey = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
      const storedUrl =
        localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL;
      setApiKeyState(storedKey);
      setApiUrlState(storedUrl);
    } catch {
      // localStorage not available (SSR or privacy mode)
    }
    setIsLoaded(true);
  }, []);

  // Cross-tab sync: listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_API_KEY) {
        setApiKeyState(e.newValue || "");
      }
      if (e.key === STORAGE_KEY_API_URL) {
        setApiUrlState(e.newValue || DEFAULT_API_URL);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const setApiKey = useCallback((value: string) => {
    setApiKeyState(value);
    try {
      localStorage.setItem(STORAGE_KEY_API_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  const setApiUrl = useCallback((value: string) => {
    setApiUrlState(value);
    try {
      localStorage.setItem(STORAGE_KEY_API_URL, value);
    } catch {
      // ignore
    }
  }, []);

  const clearSettings = useCallback(() => {
    setApiKeyState("");
    setApiUrlState(DEFAULT_API_URL);
    try {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
      localStorage.removeItem(STORAGE_KEY_API_URL);
    } catch {
      // ignore
    }
  }, []);

  return {
    apiKey,
    apiUrl,
    setApiKey,
    setApiUrl,
    clearSettings,
    isLoaded,
    defaultApiUrl: DEFAULT_API_URL,
  };
}
