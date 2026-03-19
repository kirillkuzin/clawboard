"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCrud } from "@/hooks/use-crud";
import type { Provider, ProviderFormData } from "@/lib/types";
import { PROVIDER_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  AlertCircle,
  Search,
  Cloud,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";

const EMPTY_FORM: ProviderFormData = {
  name: "",
  type: "openai",
  api_key: "",
  base_url: "",
  enabled: true,
  models: [],
  config: {},
};

export function ProvidersSection() {
  const crud = useCrud<Provider>({ basePath: "/api/v1/providers" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [configText, setConfigText] = useState("{}");
  const [modelsText, setModelsText] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const openCreate = useCallback(() => {
    setEditingProvider(null);
    setFormData(EMPTY_FORM);
    setConfigText("{}");
    setModelsText("");
    setShowApiKey(false);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((provider: Provider) => {
    setEditingProvider(provider);
    setFormData({
      name: provider.name,
      type: provider.type || "openai",
      api_key: provider.api_key || "",
      base_url: provider.base_url || "",
      enabled: provider.enabled !== false,
      models: provider.models || [],
      config: provider.config || {},
    });
    setConfigText(JSON.stringify(provider.config || {}, null, 2));
    setModelsText((provider.models || []).join(", "));
    setShowApiKey(false);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    let parsedConfig: Record<string, unknown> = {};
    try {
      parsedConfig = JSON.parse(configText);
    } catch {
      // Keep empty config on parse error
    }

    const models = modelsText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const payload = { ...formData, config: parsedConfig, models };

    if (editingProvider) {
      await crud.updateItem(editingProvider.id, payload);
    } else {
      await crud.createItem(payload);
    }

    setSaving(false);
    setDialogOpen(false);
  }, [formData, configText, modelsText, editingProvider, crud]);

  const handleDelete = useCallback(
    async (id: string) => {
      await crud.deleteItem(id);
      setDeleteConfirm(null);
    },
    [crud]
  );

  // Filter items by search
  const filteredItems = crud.items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.type || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.base_url || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const maskApiKey = (key?: string) => {
    if (!key) return "—";
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••" + key.slice(-4);
  };

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Model Providers
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage AI model providers and API configurations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={crud.fetchItems}
              disabled={crud.loading}
            >
              <RefreshCw
                size={14}
                className={cn(crud.loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} />
              Add Provider
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {crud.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{crud.error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => crud.setError(null)}
              className="text-destructive hover:text-destructive"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search providers by name, type, or base URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_1fr_100px_100px_80px] gap-4 px-4 py-3 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:grid">
            <div>Name</div>
            <div>Type</div>
            <div>Base URL</div>
            <div>API Key</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Loading state */}
          {crud.loading && crud.items.length === 0 && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading providers...
            </div>
          )}

          {/* Empty state */}
          {!crud.loading && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Cloud size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {searchQuery
                  ? "No providers match your search"
                  : "No providers found"}
              </p>
              <p className="text-xs mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Add a model provider to get started"}
              </p>
              {!searchQuery && (
                <Button size="sm" className="mt-4" onClick={openCreate}>
                  <Plus size={14} />
                  Add Provider
                </Button>
              )}
            </div>
          )}

          {/* Rows */}
          {filteredItems.map((provider) => (
            <div
              key={provider.id}
              className={cn(
                "grid grid-cols-1 lg:grid-cols-[1fr_100px_1fr_100px_100px_80px] gap-2 lg:gap-4 px-4 py-3",
                "border-b border-border/50 last:border-b-0",
                "hover:bg-muted/20 transition-colors duration-150"
              )}
            >
              {/* Name + models */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground truncate">
                    {provider.name}
                  </span>
                  <span className="lg:hidden">
                    <Badge
                      variant={
                        provider.enabled !== false ? "success" : "secondary"
                      }
                    >
                      {provider.enabled !== false ? "Active" : "Disabled"}
                    </Badge>
                  </span>
                </div>
                {provider.models && provider.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {provider.models.slice(0, 3).map((model) => (
                      <span
                        key={model}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {model}
                      </span>
                    ))}
                    {provider.models.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        +{provider.models.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Type */}
              <div className="hidden lg:flex items-center">
                <Badge variant="outline" className="text-xs">
                  {provider.type || "custom"}
                </Badge>
              </div>

              {/* Base URL */}
              <div className="hidden lg:flex items-center text-xs text-muted-foreground truncate">
                {provider.base_url || "—"}
              </div>

              {/* API Key (masked) */}
              <div className="hidden lg:flex items-center text-xs text-muted-foreground font-mono">
                {maskApiKey(provider.api_key)}
              </div>

              {/* Status */}
              <div className="hidden lg:flex items-center">
                <Badge
                  variant={
                    provider.enabled !== false ? "success" : "secondary"
                  }
                >
                  {provider.enabled !== false ? "Active" : "Disabled"}
                </Badge>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(provider)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(provider.id)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Item count */}
        {filteredItems.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Showing {filteredItems.length} of {crud.items.length} provider
            {crud.items.length !== 1 ? "s" : ""}
            {crud.lastFetched && (
              <span>
                {" · "}Last updated{" "}
                {new Date(crud.lastFetched).toLocaleTimeString()}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? "Edit Provider" : "Add Provider"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? "Update the provider configuration below."
                : "Configure a new AI model provider."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="provider-name"
                placeholder="e.g., OpenAI Production"
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider-type">Type</Label>
                <Select
                  id="provider-type"
                  value={formData.type || "openai"}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, type: e.target.value }))
                  }
                  options={PROVIDER_TYPES.map((t) => ({
                    value: t,
                    label: t.charAt(0).toUpperCase() + t.slice(1),
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-enabled">Status</Label>
                <Select
                  id="provider-enabled"
                  value={formData.enabled !== false ? "true" : "false"}
                  onChange={(e) =>
                    setFormData((f) => ({
                      ...f,
                      enabled: e.target.value === "true",
                    }))
                  }
                  options={[
                    { value: "true", label: "Enabled" },
                    { value: "false", label: "Disabled" },
                  ]}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-base-url">Base URL</Label>
              <Input
                id="provider-base-url"
                placeholder="e.g., https://api.openai.com/v1"
                value={formData.base_url || ""}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, base_url: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="provider-api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={formData.api_key || ""}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, api_key: e.target.value }))
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-models">
                Models{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="provider-models"
                placeholder="e.g., gpt-4, gpt-3.5-turbo, claude-3-opus"
                value={modelsText}
                onChange={(e) => setModelsText(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="provider-config">Configuration (JSON)</Label>
              <Textarea
                id="provider-config"
                placeholder='{"temperature": 0.7}'
                rows={3}
                value={configText}
                onChange={(e) => setConfigText(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.name.trim()}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editingProvider ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent onClose={() => setDeleteConfirm(null)}>
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this provider? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
