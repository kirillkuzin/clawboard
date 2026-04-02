"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useGatewayChannels,
  type GatewayChannel,
} from "@/hooks/use-gateway-channels";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  Radio,
  Loader2,
  LogOut,
  Wifi,
  WifiOff,
} from "lucide-react";

export function ChannelsSection() {
  return (
    <GatewayGuard>
      <ChannelsSectionInner />
    </GatewayGuard>
  );
}

function ChannelsSectionInner() {
  const channels = useGatewayChannels();
  const [searchQuery, setSearchQuery] = useState("");
  const [loggingOut, setLoggingOut] = useState<string | null>(null);

  const handleLogout = async (channel: GatewayChannel) => {
    setLoggingOut(channel.id);
    await channels.logoutChannel(channel.type);
    setLoggingOut(null);
  };

  const filteredItems = channels.items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Channels</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Communication channel connection status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={channels.fetchItems}
          disabled={channels.loading}
        >
          <RefreshCw
            size={14}
            className={cn(channels.loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {channels.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{channels.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => channels.setError(null)}
            className="text-destructive hover:text-destructive"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search channels..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {channels.loading && channels.items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading channels...
        </div>
      )}

      {/* Empty */}
      {!channels.loading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Radio size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery ? "No channels match" : "No channels configured"}
          </p>
          <p className="text-xs mt-1">
            Configure channels in your OpenClaw config file
          </p>
        </div>
      )}

      {/* Channel cards */}
      <div className="grid gap-3">
        {filteredItems.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              {channel.connected ? (
                <Wifi size={16} className="text-emerald-500" />
              ) : (
                <WifiOff size={16} className="text-muted-foreground" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-foreground capitalize">
                  {channel.name}
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {channel.type}
                </Badge>
              </div>
              {channel.account && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {channel.account}
                </p>
              )}
              {channel.error && (
                <p className="text-xs text-destructive mt-0.5 truncate">
                  {channel.error}
                </p>
              )}
            </div>

            <Badge
              variant={channel.connected ? "success" : "secondary"}
              className="shrink-0"
            >
              {channel.connected ? "Connected" : "Offline"}
            </Badge>

            {channel.connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleLogout(channel)}
                disabled={loggingOut === channel.id}
                className="text-muted-foreground hover:text-destructive"
              >
                {loggingOut === channel.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <LogOut size={14} />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      {filteredItems.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {filteredItems.filter((c) => c.connected).length} of{" "}
          {filteredItems.length} channel
          {filteredItems.length !== 1 ? "s" : ""} connected
        </p>
      )}
    </>
  );
}
