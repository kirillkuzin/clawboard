"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Sidebar, NAV_ITEMS } from "./sidebar";
import { SidebarProvider } from "./sidebar-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { useSidebar } from "@/hooks/use-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ConversationList } from "@/components/conversations/conversation-list";
import { SkillsSection } from "@/components/sections/skills-section";
import { ProvidersSection } from "@/components/sections/providers-section";
import { ChannelsSection } from "@/components/crud/channels-section";
import { WebhooksSection } from "@/components/crud/webhooks-section";
import { PluginsSection } from "@/components/crud/plugins-section";
import { CronsSection } from "@/components/crud/crons-section";
import { SubAgentsList } from "@/components/sub-agents/sub-agents-list";
import { PixelOffice } from "@/components/office/pixel-office";
import { SettingsSection } from "@/components/sections/settings-section";
import { MonitoringDashboardContainer } from "@/components/monitoring/monitoring-dashboard-container";
import { Menu } from "lucide-react";

function DashboardInner({ children }: { children?: React.ReactNode }) {
  const { pinned, activeItem, openMobile } = useSidebar();

  // Find the active nav item label
  const activeNav = NAV_ITEMS.find((n) => n.id === activeItem);
  const pageTitle = activeNav?.label ?? "Dashboard";
  const pageSection = activeNav?.section;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      {/* Main content area - adjusts margin based on sidebar state */}
      <main
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden",
          "transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          "lg:ml-16" // collapsed width = 64px = ml-16
        )}
        style={{ marginLeft: undefined }}
      >
        {/* We use a CSS approach: on lg screens, margin is set by JS; on mobile, no margin */}
        <div
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
        >
          {/* Top bar */}
          <header className="h-14 border-b border-border flex items-center px-4 gap-3 bg-background/80 backdrop-blur-sm shrink-0 z-10">
            {/* Mobile menu button */}
            <button
              onClick={openMobile}
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>

            {/* Page title + section badge */}
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-foreground">
                {pageTitle}
              </h1>
              <SectionBadge section={pageSection} />
            </div>

            {/* Right side controls */}
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-y-auto">
            <PageContent activeSection={activeItem} />
            {children}
          </div>
        </div>
      </main>

      {/* Spacer div for desktop sidebar - transitions with pin state */}
      <style>{`
        @media (min-width: 1024px) {
          main {
            margin-left: ${pinned ? 256 : 64}px !important;
            transition: margin-left 300ms cubic-bezier(0.4, 0, 0.2, 1);
          }
        }
        @media (max-width: 1023px) {
          main {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

function SectionBadge({ section }: { section?: string }) {
  if (section === "Management") {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
        CRUD
      </span>
    );
  }
  if (section === "Monitoring") {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
        READ-ONLY
      </span>
    );
  }
  return null;
}

function PageContent({ activeSection }: { activeSection: string }) {
  // Pixel Office - full-height canvas visualization
  if (activeSection === "office") {
    return <PixelOffice />;
  }
  // Render dedicated components for implemented sections
  if (activeSection === "skills") {
    return <SkillsSection />;
  }
  if (activeSection === "providers") {
    return <ProvidersSection />;
  }
  if (activeSection === "channels") {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <ChannelsSection />
        </div>
      </div>
    );
  }
  if (activeSection === "webhooks") {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <WebhooksSection />
        </div>
      </div>
    );
  }
  if (activeSection === "plugins") {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <PluginsSection />
        </div>
      </div>
    );
  }
  if (activeSection === "crons") {
    return (
      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <CronsSection />
        </div>
      </div>
    );
  }
  if (activeSection === "conversations") {
    return <ConversationList />;
  }
  if (activeSection === "agents") {
    return <SubAgentsList />;
  }
  if (activeSection === "settings") {
    return <SettingsSection />;
  }
  if (activeSection === "dashboard") {
    return <MonitoringDashboardContainer />;
  }

  const placeholders: Record<string, { title: string; description: string }> = {
    office: {
      title: "Pixel Office",
      description: "Real-time pixel-art visualization of agent activity",
    },
    dashboard: {
      title: "Dashboard Overview",
      description: "System health and metrics at a glance",
    },
    skills: {
      title: "Skills Management",
      description: "Create, read, update, and delete agent skills",
    },
    providers: {
      title: "Providers Management",
      description: "Manage AI model providers and configurations",
    },
    channels: {
      title: "Channels Management",
      description: "Configure communication channels",
    },
    webhooks: {
      title: "Webhooks Management",
      description: "Set up and manage webhook integrations",
    },
    plugins: {
      title: "Plugins Management",
      description: "Install and configure plugins",
    },
    crons: {
      title: "Cron Jobs Management",
      description: "Schedule and manage recurring tasks",
    },
    agents: {
      title: "Sub-Agents Monitor",
      description: "Monitor sub-agent activity and status",
    },
    settings: {
      title: "Settings",
      description: "Configure API connection and preferences",
    },
  };

  const page = placeholders[activeSection] || {
    title: "Unknown",
    description: "",
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">{page.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{page.description}</p>
        </div>

        {/* Placeholder content grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl border border-border bg-card p-6",
                "transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
              )}
            >
              <div className="h-3 w-24 rounded bg-muted animate-pulse mb-3" />
              <div className="h-2 w-full rounded bg-muted/50 animate-pulse mb-2" />
              <div className="h-2 w-3/4 rounded bg-muted/50 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children?: React.ReactNode }) {
  return (
    <SidebarProvider>
      <RealtimeProvider>
        <DashboardInner>{children}</DashboardInner>
      </RealtimeProvider>
    </SidebarProvider>
  );
}
