"use client";

import React, { useState, useCallback } from "react";
import { useCrud } from "@/hooks/use-crud";
import {
  Webhook,
  WebhookFormData,
  WEBHOOK_METHODS,
  WEBHOOK_EVENTS,
} from "@/lib/types";
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
import { Loader2, X } from "lucide-react";

const EMPTY_FORM: WebhookFormData = {
  name: "",
  url: "",
  method: "POST",
  enabled: true,
  events: [],
  headers: {},
  secret: "",
  description: "",
};

const METHOD_OPTIONS = WEBHOOK_METHODS.map((m) => ({
  value: m,
  label: m,
}));

const columns: Column<Webhook>[] = [
  {
    key: "name",
    label: "Name",
    render: (item) => (
      <span className="font-medium text-foreground">{item.name}</span>
    ),
  },
  {
    key: "url",
    label: "URL",
    className: "hidden md:table-cell max-w-[200px]",
    render: (item) => (
      <span className="text-xs text-muted-foreground font-mono truncate block max-w-[200px]">
        {item.url}
      </span>
    ),
  },
  {
    key: "method",
    label: "Method",
    render: (item) => (
      <Badge variant="outline" className="font-mono text-[10px]">
        {item.method}
      </Badge>
    ),
  },
  {
    key: "events",
    label: "Events",
    className: "hidden lg:table-cell",
    render: (item) => (
      <div className="flex flex-wrap gap-1 max-w-[200px]">
        {item.events.length === 0 ? (
          <span className="text-xs text-muted-foreground">None</span>
        ) : item.events.length <= 2 ? (
          item.events.map((ev) => (
            <Badge key={ev} variant="secondary" className="text-[10px]">
              {ev}
            </Badge>
          ))
        ) : (
          <>
            <Badge variant="secondary" className="text-[10px]">
              {item.events[0]}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              +{item.events.length - 1} more
            </Badge>
          </>
        )}
      </div>
    ),
  },
  {
    key: "enabled",
    label: "Status",
    render: (item) => <EnabledBadge enabled={item.enabled} />,
  },
];

export function WebhooksSection() {
  const crud = useCrud<Webhook>({ basePath: "/api/v1/webhooks" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookFormData>(EMPTY_FORM);
  const [headersText, setHeadersText] = useState("{}");
  const [headersError, setHeadersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setHeadersText("{}");
    setHeadersError(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((webhook: Webhook) => {
    setEditingId(webhook.id);
    setForm({
      name: webhook.name,
      url: webhook.url,
      method: webhook.method,
      enabled: webhook.enabled,
      events: [...webhook.events],
      headers: { ...webhook.headers },
      secret: webhook.secret || "",
      description: webhook.description || "",
    });
    setHeadersText(JSON.stringify(webhook.headers || {}, null, 2));
    setHeadersError(null);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (webhook: Webhook) => {
      await crud.deleteItem(webhook.id);
    },
    [crud]
  );

  const toggleEvent = useCallback((event: string) => {
    setForm((f) => ({
      ...f,
      events: f.events.includes(event)
        ? f.events.filter((e) => e !== event)
        : [...f.events, event],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    // Validate headers JSON
    let parsedHeaders: Record<string, string>;
    try {
      parsedHeaders = JSON.parse(headersText);
      if (
        typeof parsedHeaders !== "object" ||
        parsedHeaders === null ||
        Array.isArray(parsedHeaders)
      ) {
        setHeadersError("Headers must be a JSON object");
        return;
      }
    } catch {
      setHeadersError("Invalid JSON syntax");
      return;
    }

    // Validate URL
    if (form.url.trim()) {
      try {
        new URL(form.url);
      } catch {
        return;
      }
    }

    setSaving(true);
    const data = {
      ...form,
      headers: parsedHeaders,
    } as unknown as Record<string, unknown>;

    let result;
    if (editingId) {
      result = await crud.updateItem(editingId, data);
    } else {
      result = await crud.createItem(data);
    }

    setSaving(false);
    if (result) {
      setDialogOpen(false);
    }
  }, [form, headersText, editingId, crud]);

  return (
    <>
      <CrudTable<Webhook>
        title="Webhooks"
        description="Manage webhook integrations for event notifications"
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
        searchPlaceholder="Search webhooks..."
        emptyMessage="No webhooks configured yet"
        addLabel="Add Webhook"
      />

      {/* Webhook Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Webhook" : "Create Webhook"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the webhook configuration"
                : "Add a new webhook for event notifications"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="webhook-name">Name *</Label>
              <Input
                id="webhook-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., slack-notifications"
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL *</Label>
              <Input
                id="webhook-url"
                type="url"
                value={form.url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, url: e.target.value }))
                }
                placeholder="https://example.com/webhook"
                className="font-mono text-xs"
              />
            </div>

            {/* Method + Enabled row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-method">Method</Label>
                <Select
                  id="webhook-method"
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, method: e.target.value }))
                  }
                  options={METHOD_OPTIONS}
                />
              </div>
              <div className="space-y-2">
                <Label>Enabled</Label>
                <div className="flex items-center h-9">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, enabled: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="webhook-desc">Description</Label>
              <Input
                id="webhook-desc"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of this webhook"
              />
            </div>

            {/* Secret */}
            <div className="space-y-2">
              <Label htmlFor="webhook-secret">Secret (optional)</Label>
              <Input
                id="webhook-secret"
                type="password"
                value={form.secret || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, secret: e.target.value }))
                }
                placeholder="Signing secret for payload verification"
              />
            </div>

            {/* Events */}
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border bg-muted/20 max-h-[140px] overflow-y-auto">
                {WEBHOOK_EVENTS.map((event) => {
                  const selected = form.events.includes(event);
                  return (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleEvent(event)}
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        selected
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/80"
                      }`}
                    >
                      {event}
                      {selected && <X size={10} className="ml-1" />}
                    </button>
                  );
                })}
              </div>
              {form.events.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {form.events.length} event
                  {form.events.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>

            {/* Headers JSON */}
            <div className="space-y-2">
              <Label htmlFor="webhook-headers">Custom Headers (JSON)</Label>
              <Textarea
                id="webhook-headers"
                value={headersText}
                onChange={(e) => {
                  setHeadersText(e.target.value);
                  setHeadersError(null);
                }}
                placeholder='{"X-Custom-Header": "value"}'
                className="font-mono text-xs min-h-[80px]"
              />
              {headersError && (
                <p className="text-xs text-destructive">{headersError}</p>
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
              disabled={saving || !form.name.trim() || !form.url.trim()}
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
