"use client";

import React from "react";
import { Sidebar } from "./sidebar";
import { SidebarProvider } from "./sidebar-provider";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { pinned } = useSidebar();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={cn(
          "flex-1 min-h-screen",
          "transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        )}
        style={{ marginLeft: pinned ? 256 : 64 }}
      >
        {children}
      </main>
    </div>
  );
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutInner>{children}</LayoutInner>
    </SidebarProvider>
  );
}
