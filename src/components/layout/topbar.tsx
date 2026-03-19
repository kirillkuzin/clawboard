"use client";

import { Menu, Wifi, WifiOff } from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

interface TopbarProps {
  connected?: boolean;
}

export function Topbar({ connected = false }: TopbarProps) {
  const { openMobile } = useSidebar();

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 shrink-0">
      {/* Hamburger menu button - only visible on mobile */}
      <button
        onClick={openMobile}
        className="flex lg:hidden h-9 w-9 items-center justify-center rounded-md hover:bg-muted transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile logo */}
      <div className="flex lg:hidden items-center gap-2">
        <span className="text-lg font-bold">Clawboard</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Connection status indicator */}
      <div
        className={cn(
          "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full",
          connected
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-destructive/10 text-destructive"
        )}
      >
        {connected ? (
          <>
            <Wifi className="h-3 w-3" />
            <span className="hidden sm:inline">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            <span className="hidden sm:inline">Disconnected</span>
          </>
        )}
      </div>
    </header>
  );
}
