"use client";

import React, { useState, useCallback } from "react";
import { useCrud } from "@/hooks/use-crud";
import { Channel, ChannelFormData, CHANNEL_TYPES } from "@/lib/types";
import { CrudTable, EnabledBadge, type Column } from "./crud-table";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
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

const EMPTY_FORM: ChannelFormData = {
  name: "",
  type: "slack",
  enabled: true,
  config: {},
  description: "",
};

const columns: Column<Channel>[] = [
  {
    key: "name",
    label: "Name",
    render: (item) => (
      <span className="font-medium text-foreground">{item.name}</span>
    ),
  },
  {
    key: "type",
    label: "Type",
    render: (item) => (
      <Badge variant="outline" className="capitalize">
        {item.type}
      </Badge>
    ),
  },
  {
    key: "enabled",
    label: "Status",
    render: (item) => <EnabledBadge enabled={item.enabled} />,
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

export function ChannelsSection() {
  const crud = useCrud<Channel>({ basePath: "/api/v1/channels" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChannelFormData>(EMPTY_FORM);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setConfigText("{}");
    setConfigError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((channel: Channel) => {
    setEditingId(channel.id);
    setForm({
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      config: channel.config || {},
      description: channel.description || "",
    });
    setConfigText(JSON.stringify(channel.config || {}, null, 2));
    setConfigError(null);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (channel: Channel) => {
      await crud.deleteItem(channel.id);
    },
    [crud]
  );

  const handleSave = useCallback(async () => {
    // Validate config JSON
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(configText);
      if (typeof parsedConfig !== "object" || parsedConfig === null || Array.isArray(parsedConfig)) {
        setConfigError("Config must be a JSON object");
        return;
      }
    } catch {
      setConfigError("Invalid JSON syntax");
      return;
    }

    setSaving(true);
    const data: ChannelFormData = {
      ...form,
      config: parsedConfig,
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
  }, [form, configText, editingId, crud]);

  return (
    <>
      <CrudTable<Channel>
        title="Channels"
        description="Configure communication channels for your OpenClaw instance"
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
        searchPlaceholder="Search channels..."
        emptyMessage="No channels configured yet"
        addLabel="Add Channel"
      />

      {/* Channel Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Channel" : "Create Channel"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the channel configuration"
                : "Add a new communication channel"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="channel-name">Name *</Label>
              <Input
                id="channel-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., slack-general"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="channel-type">Type *</Label>
              <Select
                id="channel-type"
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value }))
                }
                options={CHANNEL_TYPES.map((t) => ({
                  value: t,
                  label: t.charAt(0).toUpperCase() + t.slice(1),
                }))}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="channel-desc">Description</Label>
              <Input
                id="channel-desc"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this channel"
              />
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="channel-enabled">Enabled</Label>
              <Switch
                id="channel-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, enabled: checked }))
                }
              />
            </div>

            {/* Config JSON */}
            <div className="space-y-2">
              <Label htmlFor="channel-config">
                Configuration (JSON)
              </Label>
              <Textarea
                id="channel-config"
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setConfigError(null);
                }}
                placeholder='{"token": "xoxb-...", "channel": "#general"}'
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
