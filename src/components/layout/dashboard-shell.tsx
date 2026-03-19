"use client";

import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { SidebarProvider } from "./sidebar-provider";
import { useSidebar } from "@/hooks/use-sidebar";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
  children: React.ReactNode;
}

function ShellInner({ children }: DashboardShellProps) {
  const { pinned } = useSidebar();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden min-w-0",
          "transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        )}
        style={{ marginLeft: pinned ? 256 : 64 }}
      >
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <SidebarProvider>
      <ShellInner>{children}</ShellInner>
    </SidebarProvider>
  );
}
