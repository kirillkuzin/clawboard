"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useGatewayModels } from "@/hooks/use-gateway-models";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  Server,
  Loader2,
} from "lucide-react";

export function ProvidersSection() {
  return (
    <GatewayGuard>
      <ProvidersSectionInner />
    </GatewayGuard>
  );
}

function ProvidersSectionInner() {
  const { models, loading, error, fetchModels, setError } =
    useGatewayModels();
  const [searchQuery, setSearchQuery] = useState("");

  // Group models by provider
  const providerMap = new Map<string, typeof models>();
  for (const model of models) {
    const provider = model.provider ?? model.ownedBy ?? "unknown";
    if (!providerMap.has(provider)) {
      providerMap.set(provider, []);
    }
    providerMap.get(provider)!.push(model);
  }

  const filteredProviders = Array.from(providerMap.entries()).filter(
    ([provider, providerModels]) =>
      !searchQuery ||
      provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      providerModels.some((m) =>
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Models & Providers
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Available AI models configured in your OpenClaw instance
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchModels}
            disabled={loading}
          >
            <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
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
            placeholder="Search models or providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {loading && models.length === 0 && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" />
            Loading models...
          </div>
        )}

        {/* Empty */}
        {!loading && filteredProviders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Server size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {searchQuery ? "No results" : "No models available"}
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? "Try a different search"
                : "Configure providers in your OpenClaw config file"}
            </p>
          </div>
        )}

        {/* Provider groups */}
        <div className="space-y-4">
          {filteredProviders.map(([provider, providerModels]) => (
            <div
              key={provider}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
                <Server size={14} className="text-muted-foreground" />
                <span className="font-semibold text-sm text-foreground capitalize">
                  {provider}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {providerModels.length} model
                  {providerModels.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {providerModels.map((model) => (
                <div
                  key={model.id}
                  className="px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors flex items-center gap-3"
                >
                  <code className="text-xs font-mono text-foreground flex-1 truncate">
                    {model.id}
                  </code>
                  {model.contextWindow && (
                    <span className="text-[10px] text-muted-foreground">
                      {(model.contextWindow / 1000).toFixed(0)}k ctx
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {models.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            {models.length} model{models.length !== 1 ? "s" : ""} across{" "}
            {providerMap.size} provider{providerMap.size !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
