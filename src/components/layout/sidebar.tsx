"use client";

import React, { useCallback, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  Building2,
  Zap,
  Cloud,
  Radio,
  Webhook,
  Puzzle,
  Clock,
  MessageSquare,
  Bot,
  Settings,
  ChevronRight,
  Pin,
  PinOff,
  X,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  section: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "office", label: "Pixel Office", icon: Building2, href: "/", section: "Visualization" },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard", section: "Visualization" },
  { id: "skills", label: "Skills", icon: Zap, href: "/skills", section: "Management" },
  { id: "providers", label: "Providers", icon: Cloud, href: "/providers", section: "Management" },
  { id: "channels", label: "Channels", icon: Radio, href: "/channels", section: "Management" },
  { id: "webhooks", label: "Webhooks", icon: Webhook, href: "/webhooks", section: "Management" },
  { id: "plugins", label: "Plugins", icon: Puzzle, href: "/plugins", section: "Management" },
  { id: "crons", label: "Cron Jobs", icon: Clock, href: "/crons", section: "Management" },
  { id: "conversations", label: "Conversations", icon: MessageSquare, href: "/conversations", section: "Monitoring" },
  { id: "agents", label: "Sub-Agents", icon: Bot, href: "/agents", section: "Monitoring" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings", section: "System" },
];

const COLLAPSED_WIDTH = 64;
const EXPANDED_WIDTH = 256;

/** Shared navigation content for both desktop and mobile sidebars */
function SidebarNavContent({
  showLabels,
  onItemClick,
}: {
  showLabels: boolean;
  onItemClick?: () => void;
}) {
  const { activeItem, setActiveItem } = useSidebar();

  const sections = NAV_ITEMS.reduce<Record<string, NavItem[]>>((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {});

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2">
      {Object.entries(sections).map(([sectionName, items], sectionIdx) => (
        <div key={sectionName} className="mb-1">
          {sectionIdx > 0 && (
            <div className="mx-3 my-2 border-t border-border/40" />
          )}
          <div
            className={cn(
              "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50",
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden whitespace-nowrap",
              showLabels ? "opacity-100 max-h-8" : "opacity-0 max-h-0 py-0"
            )}
          >
            {sectionName}
          </div>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeItem;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveItem(item.id);
                  onItemClick?.();
                }}
                className={cn(
                  "w-full flex items-center rounded-lg mb-0.5",
                  "transition-all duration-200 ease-out",
                  "group relative",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-text-active"
                )}
                style={{ height: 40, paddingLeft: 12, paddingRight: 12 }}
                title={!showLabels ? item.label : undefined}
              >
                <div
                  className={cn(
                    "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-primary",
                    "transition-all duration-300 ease-out",
                    isActive ? "h-5 opacity-100" : "h-0 opacity-0"
                  )}
                />
                <Icon
                  size={20}
                  className={cn(
                    "shrink-0 transition-all duration-200 ease-out",
                    isActive
                      ? "text-primary scale-110"
                      : "text-muted-foreground group-hover:text-accent group-hover:scale-105"
                  )}
                />
                <span
                  className={cn(
                    "ml-3 text-sm font-medium whitespace-nowrap overflow-hidden",
                    "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
                    showLabels ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0 ml-0"
                  )}
                >
                  {item.label}
                </span>
                {!showLabels && (
                  <div
                    className={cn(
                      "absolute left-full ml-3 px-2.5 py-1.5 rounded-lg",
                      "bg-card text-card-foreground text-xs font-medium",
                      "border border-border shadow-xl shadow-black/20",
                      "opacity-0 invisible group-hover:opacity-100 group-hover:visible",
                      "transition-all duration-200 ease-out pointer-events-none",
                      "translate-x-1 group-hover:translate-x-0",
                      "z-[60] whitespace-nowrap"
                    )}
                  >
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const {
    expanded,
    pinned,
    mobileOpen,
    setExpanded,
    setPinned,
    closeMobile,
  } = useSidebar();

  const sidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (pinned) return;
    hoverTimeoutRef.current = setTimeout(() => setExpanded(true), 200);
  }, [pinned, setExpanded]);

  const handleMouseLeave = useCallback(() => {
    if (pinned) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setExpanded(false);
  }, [pinned, setExpanded]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handlePinToggle = useCallback(() => {
    if (pinned) {
      setPinned(false);
      setExpanded(false);
    } else {
      setPinned(true);
      setExpanded(true);
    }
  }, [pinned, setPinned, setExpanded]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) closeMobile();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen, closeMobile]);

  const brandHeader = (showTitle: boolean, extra?: React.ReactNode) => (
    <div className="flex items-center h-14 px-3 border-b border-border/50 shrink-0 gap-3">
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent shrink-0 shadow-lg shadow-primary/20">
        <Shield size={18} className="text-white" />
      </div>
      <div
        className={cn(
          "overflow-hidden whitespace-nowrap",
          "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          showTitle ? "opacity-100 max-w-[160px]" : "opacity-0 max-w-0"
        )}
      >
        <div className="flex flex-col">
          <span className="font-bold text-sm text-foreground tracking-tight">ClawBoard</span>
          <span className="text-[10px] text-muted-foreground leading-none">OpenClaw Admin</span>
        </div>
      </div>
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );

  const connectionStatus = (showLabel: boolean) => (
    <div className="px-3 py-2.5 border-t border-border/30">
      <div className="flex items-center gap-2.5 px-1">
        <div className="relative shrink-0">
          <div className="w-2 h-2 rounded-full bg-zinc-600" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-zinc-600 animate-ping opacity-40" />
        </div>
        <span
          className={cn(
            "text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            showLabel ? "opacity-100 max-w-[160px]" : "opacity-0 max-w-0"
          )}
        >
          Not connected
        </span>
      </div>
    </div>
  );

  const pinButton = (showLabel: boolean) => (
    <div className="shrink-0 border-t border-border/30 p-2">
      <button
        onClick={handlePinToggle}
        className={cn(
          "w-full flex items-center rounded-lg px-3 h-10",
          "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground",
          "transition-all duration-200 ease-out group"
        )}
        title={pinned ? "Unpin sidebar" : "Pin sidebar"}
      >
        {pinned ? (
          <PinOff size={18} className="shrink-0 text-accent transition-transform duration-200 group-hover:rotate-12" />
        ) : showLabel ? (
          <Pin size={18} className="shrink-0 transition-transform duration-200 group-hover:-rotate-12" />
        ) : (
          <ChevronRight size={18} className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
        )}
        <span
          className={cn(
            "ml-3 text-xs font-medium whitespace-nowrap overflow-hidden",
            "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
            showLabel ? "opacity-100 max-w-[140px]" : "opacity-0 max-w-0"
          )}
        >
          {pinned ? "Unpin sidebar" : "Pin sidebar"}
        </span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden",
          "transition-opacity duration-300 ease-out",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={closeMobile}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden",
          "bg-sidebar-bg border-r border-border/50 shadow-2xl shadow-black/50",
          "transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: 280 }}
        aria-label="Mobile navigation"
        role="dialog"
        aria-modal="true"
      >
        {brandHeader(true,
          <button
            onClick={closeMobile}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        )}
        <SidebarNavContent showLabels={true} onItemClick={closeMobile} />
        {connectionStatus(true)}
      </aside>

      {/* Desktop sidebar */}
      <aside
        ref={sidebarRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed left-0 top-0 z-40 h-screen flex-col",
          "bg-sidebar-bg border-r border-border/50",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "select-none hidden lg:flex"
        )}
        style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
        aria-label="Desktop navigation"
      >
        {brandHeader(expanded)}
        <SidebarNavContent showLabels={expanded} />
        {connectionStatus(expanded)}
        {pinButton(expanded)}
      </aside>
    </>
  );
}

export { NAV_ITEMS };
export type { NavItem as SidebarNavItem };
