"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { SidebarContext, type SidebarContextType } from "@/hooks/use-sidebar";

const SIDEBAR_PINNED_KEY = "clawboard-sidebar-pinned";
const SIDEBAR_ACTIVE_KEY = "clawboard-sidebar-active";
const MOBILE_BREAKPOINT = 1024;

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinnedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeItem, setActiveItemState] = useState("office");

  // Load persisted state from localStorage on mount
  useEffect(() => {
    try {
      const storedPinned = localStorage.getItem(SIDEBAR_PINNED_KEY);
      if (storedPinned === "true") {
        setPinnedState(true);
        setExpanded(true);
      }
      const storedActive = localStorage.getItem(SIDEBAR_ACTIVE_KEY);
      if (storedActive) {
        setActiveItemState(storedActive);
      }
    } catch {
      // localStorage not available
    }
  }, []);

  // Cross-tab sync: listen for storage events to keep sidebar state in sync
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SIDEBAR_PINNED_KEY) {
        const isPinned = e.newValue === "true";
        setPinnedState(isPinned);
        setExpanded(isPinned);
      }
      if (e.key === SIDEBAR_ACTIVE_KEY && e.newValue) {
        setActiveItemState(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Close mobile drawer when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= MOBILE_BREAKPOINT) {
        setMobileOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Wrap setPinned to always persist to localStorage
  const setPinned = useCallback((value: boolean) => {
    setPinnedState(value);
    try {
      localStorage.setItem(SIDEBAR_PINNED_KEY, String(value));
    } catch {
      // localStorage not available
    }
  }, []);

  const toggle = useCallback(() => {
    setPinnedState((prev) => {
      const next = !prev;
      setExpanded(next);
      try {
        localStorage.setItem(SIDEBAR_PINNED_KEY, String(next));
      } catch {
        // localStorage not available
      }
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const toggleMobile = useCallback(() => setMobileOpen((p) => !p), []);

  const setActiveItem = useCallback((id: string) => {
    setActiveItemState(id);
    try {
      localStorage.setItem(SIDEBAR_ACTIVE_KEY, id);
    } catch {
      // localStorage not available
    }
  }, []);

  const value = useMemo<SidebarContextType>(
    () => ({
      expanded,
      pinned,
      mobileOpen,
      activeItem,
      setExpanded,
      setPinned,
      toggle,
      openMobile,
      closeMobile,
      toggleMobile,
      setActiveItem,
    }),
    [expanded, pinned, mobileOpen, activeItem, setExpanded, setPinned, toggle, openMobile, closeMobile, toggleMobile, setActiveItem]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}
