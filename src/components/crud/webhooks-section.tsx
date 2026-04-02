"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { useGatewayConfig } from "@/hooks/use-gateway-config";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  AlertCircle,
  Search,
  Webhook,
  Loader2,
} from "lucide-react";

interface HookMapping {
  path?: string;
  source?: string;
  action?: string;
  template?: string;
  [key: string]: unknown;
}

export function WebhooksSection() {
  return (
    <GatewayGuard>
      <WebhooksSectionInner />
    </GatewayGuard>
  );
}

function WebhooksSectionInner() {
  const config = useGatewayConfig();
  const [searchQuery, setSearchQuery] = useState("");

  // Extract hooks/webhooks from the YAML config
  const hooks = parseHooksFromConfig(config.raw);

  const filteredHooks = hooks.filter(
    (h) =>
      !searchQuery ||
      (h.path ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.source ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (h.action ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Webhooks</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Hook mappings configured in your OpenClaw instance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={config.fetchConfig}
          disabled={config.loading}
        >
          <RefreshCw
            size={14}
            className={cn(config.loading && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {config.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{config.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => config.setError(null)}
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
          placeholder="Search webhooks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {config.loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading config...
        </div>
      )}

      {/* Empty */}
      {!config.loading && filteredHooks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Webhook size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery ? "No webhooks match" : "No webhooks configured"}
          </p>
          <p className="text-xs mt-1">
            Add hook mappings in your OpenClaw config file
          </p>
        </div>
      )}

      {/* Hook list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredHooks.map((hook, idx) => (
          <div
            key={idx}
            className="px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2 flex-wrap">
              {hook.path && (
                <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded text-foreground">
                  {hook.path}
                </code>
              )}
              {hook.source && (
                <Badge variant="outline" className="text-[10px]">
                  source: {hook.source}
                </Badge>
              )}
              {hook.action && (
                <Badge
                  variant={hook.action === "wake" ? "success" : "secondary"}
                  className="text-[10px]"
                >
                  {hook.action}
                </Badge>
              )}
            </div>
            {hook.template && (
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                {hook.template}
              </p>
            )}
          </div>
        ))}
      </div>

      {hooks.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {hooks.length} hook mapping{hooks.length !== 1 ? "s" : ""}
        </p>
      )}
    </>
  );
}

/**
 * Parse hook mappings from raw YAML config string.
 * Looks for `hooks:` or `webhooks:` sections.
 */
function parseHooksFromConfig(raw: string): HookMapping[] {
  if (!raw) return [];

  // Simple YAML-like extraction — try JSON first, then basic YAML parsing
  try {
    const parsed = JSON.parse(raw);
    if (parsed.hooks && Array.isArray(parsed.hooks)) return parsed.hooks;
    if (parsed.webhooks && Array.isArray(parsed.webhooks))
      return parsed.webhooks;
    return [];
  } catch {
    // Not JSON, try basic extraction from YAML
    // This is a simplified parser — full YAML parsing would need a library
    const lines = raw.split("\n");
    const hooks: HookMapping[] = [];
    let inHooksSection = false;
    let currentHook: HookMapping | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed === "hooks:" ||
        trimmed === "webhooks:" ||
        trimmed === "hook-mappings:"
      ) {
        inHooksSection = true;
        continue;
      }
      if (inHooksSection) {
        if (trimmed.startsWith("- ")) {
          if (currentHook) hooks.push(currentHook);
          currentHook = {};
          const content = trimmed.slice(2).trim();
          if (content) {
            const [key, ...valueParts] = content.split(":");
            if (key && valueParts.length) {
              currentHook[key.trim()] = valueParts.join(":").trim();
            }
          }
        } else if (trimmed.includes(":") && currentHook) {
          const [key, ...valueParts] = trimmed.split(":");
          if (key && valueParts.length) {
            currentHook[key.trim()] = valueParts.join(":").trim();
          }
        } else if (!trimmed.startsWith(" ") && !trimmed.startsWith("-") && trimmed.length > 0) {
          // End of hooks section
          inHooksSection = false;
          if (currentHook) hooks.push(currentHook);
          currentHook = null;
        }
      }
    }
    if (currentHook) hooks.push(currentHook);
    return hooks;
  }
}
