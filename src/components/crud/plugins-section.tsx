"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useGatewayTools } from "@/hooks/use-gateway-tools";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  Puzzle,
  Loader2,
} from "lucide-react";

export function PluginsSection() {
  return (
    <GatewayGuard>
      <PluginsSectionInner />
    </GatewayGuard>
  );
}

function PluginsSectionInner() {
  const tools = useGatewayTools();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredItems = tools.items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.source ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by source/plugin
  const sourceMap = new Map<string, typeof tools.items>();
  for (const tool of filteredItems) {
    const source = tool.source ?? "built-in";
    if (!sourceMap.has(source)) {
      sourceMap.set(source, []);
    }
    sourceMap.get(source)!.push(tool);
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            Plugins & Tools
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Available tools and plugins in your OpenClaw instance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={tools.fetchItems}
          disabled={tools.loading}
        >
          <RefreshCw
            size={14}
            className={cn(tools.loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {tools.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{tools.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => tools.setError(null)}
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
          placeholder="Search tools and plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {tools.loading && tools.items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading tools...
        </div>
      )}

      {/* Empty */}
      {!tools.loading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Puzzle size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery ? "No tools match" : "No tools available"}
          </p>
          <p className="text-xs mt-1">
            Install plugins in your OpenClaw config to add tools
          </p>
        </div>
      )}

      {/* Tool groups by source */}
      <div className="space-y-4">
        {Array.from(sourceMap.entries()).map(([source, sourceTools]) => (
          <div
            key={source}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              <Puzzle size={14} className="text-muted-foreground" />
              <span className="font-semibold text-sm text-foreground">
                {source}
              </span>
              <Badge variant="secondary" className="text-[10px]">
                {sourceTools.length} tool
                {sourceTools.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {sourceTools.map((tool) => (
              <div
                key={tool.id}
                className="px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">
                    {tool.name}
                  </span>
                  {tool.type && (
                    <Badge variant="outline" className="text-[10px]">
                      {tool.type}
                    </Badge>
                  )}
                </div>
                {tool.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {tool.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {tools.items.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {tools.items.length} tool{tools.items.length !== 1 ? "s" : ""} across{" "}
          {sourceMap.size} source{sourceMap.size !== 1 ? "s" : ""}
        </p>
      )}
    </>
  );
}
