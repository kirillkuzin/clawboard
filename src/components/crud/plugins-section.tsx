"use client";

import React, { useState, useCallback } from "react";
import { useCrud } from "@/hooks/use-crud";
import { Plugin, PluginFormData, PLUGIN_TYPES } from "@/lib/types";
import { CrudTable, EnabledBadge, type Column } from "./crud-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

const EMPTY_FORM: PluginFormData = {
  name: "",
  description: "",
  version: "1.0.0",
  enabled: true,
  type: "custom",
  entry_point: "",
  config: {},
  dependencies: [],
  author: "",
};

const columns: Column<Plugin>[] = [
  {
    key: "name",
    label: "Name",
    render: (item) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{item.name}</span>
        {item.version && (
          <span className="text-xs text-muted-foreground">v{item.version}</span>
        )}
      </div>
    ),
  },
  {
    key: "type",
    label: "Type",
    render: (item) => (
      <Badge variant="outline" className="capitalize">
        {item.type || "custom"}
      </Badge>
    ),
  },
  {
    key: "enabled",
    label: "Status",
    render: (item) => <EnabledBadge enabled={item.enabled} />,
  },
  {
    key: "author",
    label: "Author",
    className: "hidden lg:table-cell",
    render: (item) => (
      <span className="text-muted-foreground text-xs">
        {item.author || "—"}
      </span>
    ),
  },
  {
    key: "description",
    label: "Description",
    className: "hidden md:table-cell max-w-[200px] truncate",
    render: (item) => (
      <span className="text-muted-foreground text-xs">
        {item.description || "—"}
      </span>
    ),
  },
];

export function PluginsSection() {
  const crud = useCrud<Plugin>({ basePath: "/api/v1/plugins" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PluginFormData>(EMPTY_FORM);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);
  const [depsText, setDepsText] = useState("");
  const [saving, setSaving] = useState(false);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setConfigText("{}");
    setDepsText("");
    setConfigError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((plugin: Plugin) => {
    setEditingId(plugin.id);
    setForm({
      name: plugin.name,
      description: plugin.description || "",
      version: plugin.version || "1.0.0",
      enabled: plugin.enabled,
      type: plugin.type || "custom",
      entry_point: plugin.entry_point || "",
      config: plugin.config || {},
      dependencies: plugin.dependencies || [],
      author: plugin.author || "",
    });
    setConfigText(JSON.stringify(plugin.config || {}, null, 2));
    setDepsText((plugin.dependencies || []).join(", "));
    setConfigError(null);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (plugin: Plugin) => {
      await crud.deleteItem(plugin.id);
    },
    [crud]
  );

  const handleSave = useCallback(async () => {
    // Validate config JSON
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText);
      if (
        typeof parsedConfig !== "object" ||
        parsedConfig === null ||
        Array.isArray(parsedConfig)
      ) {
        setConfigError("Config must be a JSON object");
        return;
      }
    } catch {
      setConfigError("Invalid JSON syntax");
      return;
    }

    setSaving(true);
    const deps = depsText
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    const data: PluginFormData = {
      ...form,
      config: parsedConfig,
      dependencies: deps,
    };

    let result;
    if (editingId) {
      result = await crud.updateItem(editingId, data as unknown as Record<string, unknown>);
    } else {
      result = await crud.createItem(data as unknown as Record<string, unknown>);
    }

    setSaving(false);
    if (result) {
      setDialogOpen(false);
    }
  }, [form, configText, depsText, editingId, crud]);

  const typeOptions = PLUGIN_TYPES.map((t) => ({
    value: t,
    label: t.charAt(0).toUpperCase() + t.slice(1),
  }));

  return (
    <>
      <CrudTable<Plugin>
        title="Plugins"
        description="Install and configure plugins for your OpenClaw instance"
        items={crud.items}
        columns={columns}
        loading={crud.loading}
        error={crud.error}
        operationLoading={saving}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onRefresh={crud.fetchItems}
        onClearError={() => crud.setError(null)}
        searchPlaceholder="Search plugins..."
        emptyMessage="No plugins installed yet"
        addLabel="Add Plugin"
      />

      {/* Plugin Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Plugin" : "Add Plugin"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the plugin configuration"
                : "Install a new plugin"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="plugin-name">Name *</Label>
              <Input
                id="plugin-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., my-custom-plugin"
              />
            </div>

            {/* Type & Version row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="plugin-type">Type</Label>
                <Select
                  id="plugin-type"
                  value={form.type || "custom"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  options={typeOptions}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plugin-version">Version</Label>
                <Input
                  id="plugin-version"
                  value={form.version || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, version: e.target.value }))
                  }
                  placeholder="1.0.0"
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="plugin-desc">Description</Label>
              <Input
                id="plugin-desc"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this plugin"
              />
            </div>

            {/* Author */}
            <div className="space-y-2">
              <Label htmlFor="plugin-author">Author</Label>
              <Input
                id="plugin-author"
                value={form.author || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, author: e.target.value }))
                }
                placeholder="Author name or organization"
              />
            </div>

            {/* Entry Point */}
            <div className="space-y-2">
              <Label htmlFor="plugin-entry">Entry Point</Label>
              <Input
                id="plugin-entry"
                value={form.entry_point || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, entry_point: e.target.value }))
                }
                placeholder="e.g., plugins.my_plugin:main"
                className="font-mono text-xs"
              />
            </div>

            {/* Dependencies */}
            <div className="space-y-2">
              <Label htmlFor="plugin-deps">
                Dependencies{" "}
                <span className="text-muted-foreground font-normal">
                  (comma-separated)
                </span>
              </Label>
              <Input
                id="plugin-deps"
                value={depsText}
                onChange={(e) => setDepsText(e.target.value)}
                placeholder="e.g., requests, beautifulsoup4"
                className="font-mono text-xs"
              />
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="plugin-enabled">Enabled</Label>
              <Switch
                id="plugin-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, enabled: checked }))
                }
              />
            </div>

            {/* Config JSON */}
            <div className="space-y-2">
              <Label htmlFor="plugin-config">Configuration (JSON)</Label>
              <Textarea
                id="plugin-config"
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setConfigError(null);
                }}
                placeholder='{"setting": "value"}'
                className="font-mono text-xs min-h-[100px]"
              />
              {configError && (
                <p className="text-xs text-destructive">{configError}</p>
              )}
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
              disabled={saving || !form.name.trim()}
            >
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
