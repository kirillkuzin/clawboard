"use client";

import React, { useState, useCallback } from "react";
import { useCrud } from "@/hooks/use-crud";
import {
  CronJob,
  CronJobFormData,
  CRON_PRESETS,
  TIMEZONES,
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
import { Loader2, Clock, CalendarClock } from "lucide-react";

const EMPTY_FORM: CronJobFormData = {
  name: "",
  schedule: "0 * * * *",
  enabled: true,
  command: "",
  skill_id: "",
  description: "",
  timezone: "UTC",
  max_retries: 3,
  timeout: 300,
  config: {},
};

/** Format a date string for display */
function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

/** Get a human-readable label for a cron schedule */
function getScheduleLabel(schedule: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === schedule);
  return preset?.label || schedule;
}

/** Get status badge variant */
function getStatusVariant(
  status?: string
): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "running":
      return "warning";
    case "success":
    case "completed":
      return "success";
    case "failed":
    case "error":
      return "destructive";
    default:
      return "secondary";
  }
}

const columns: Column<CronJob>[] = [
  {
    key: "name",
    label: "Name",
    render: (item) => (
      <div className="flex flex-col">
        <span className="font-medium text-foreground">{item.name}</span>
        {item.description && (
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {item.description}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "schedule",
    label: "Schedule",
    render: (item) => (
      <div className="flex flex-col">
        <code className="text-xs font-mono text-foreground bg-muted/50 px-1.5 py-0.5 rounded w-fit">
          {item.schedule}
        </code>
        <span className="text-xs text-muted-foreground mt-0.5">
          {getScheduleLabel(item.schedule)}
        </span>
      </div>
    ),
  },
  {
    key: "enabled",
    label: "Status",
    render: (item) => (
      <div className="flex flex-col gap-1">
        <EnabledBadge enabled={item.enabled} />
        {item.status && (
          <Badge variant={getStatusVariant(item.status)} className="w-fit capitalize">
            {item.status}
          </Badge>
        )}
      </div>
    ),
  },
  {
    key: "last_run",
    label: "Last Run",
    className: "hidden lg:table-cell",
    render: (item) => (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock size={12} />
        {formatDate(item.last_run)}
      </div>
    ),
  },
  {
    key: "next_run",
    label: "Next Run",
    className: "hidden xl:table-cell",
    render: (item) => (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarClock size={12} />
        {item.enabled ? formatDate(item.next_run) : "—"}
      </div>
    ),
  },
];

export function CronsSection() {
  const crud = useCrud<CronJob>({ basePath: "/api/v1/crons" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CronJobFormData>(EMPTY_FORM);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [usePreset, setUsePreset] = useState(true);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setConfigText("{}");
    setConfigError(null);
    setUsePreset(true);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((cron: CronJob) => {
    setEditingId(cron.id);
    setForm({
      name: cron.name,
      schedule: cron.schedule,
      enabled: cron.enabled,
      command: cron.command || "",
      skill_id: cron.skill_id || "",
      description: cron.description || "",
      timezone: cron.timezone || "UTC",
      max_retries: cron.max_retries ?? 3,
      timeout: cron.timeout ?? 300,
      config: cron.config || {},
    });
    setConfigText(JSON.stringify(cron.config || {}, null, 2));
    setConfigError(null);
    // Check if the schedule matches a preset
    const isPreset = CRON_PRESETS.some((p) => p.value === cron.schedule);
    setUsePreset(isPreset);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (cron: CronJob) => {
      await crud.deleteItem(cron.id);
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

    // Validate schedule
    if (!form.schedule.trim()) {
      crud.setError("Schedule is required");
      return;
    }

    setSaving(true);
    const data: CronJobFormData = {
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

  const presetOptions = CRON_PRESETS.map((p) => ({
    value: p.value,
    label: p.label,
  }));

  const timezoneOptions = TIMEZONES.map((tz) => ({
    value: tz,
    label: tz,
  }));

  return (
    <>
      <CrudTable<CronJob>
        title="Cron Jobs"
        description="Schedule and manage recurring tasks for your OpenClaw instance"
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
        searchPlaceholder="Search cron jobs..."
        emptyMessage="No cron jobs configured yet"
        addLabel="Add Cron Job"
      />

      {/* Cron Job Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Cron Job" : "Create Cron Job"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the cron job configuration"
                : "Schedule a new recurring task"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="cron-name">Name *</Label>
              <Input
                id="cron-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g., daily-cleanup"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="cron-desc">Description</Label>
              <Input
                id="cron-desc"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Brief description of what this job does"
              />
            </div>

            {/* Schedule */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cron-schedule">Schedule *</Label>
                <button
                  type="button"
                  onClick={() => setUsePreset(!usePreset)}
                  className="text-xs text-primary hover:text-primary/80 underline transition-colors"
                >
                  {usePreset ? "Custom expression" : "Use preset"}
                </button>
              </div>
              {usePreset ? (
                <Select
                  id="cron-schedule"
                  value={form.schedule}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schedule: e.target.value }))
                  }
                  options={presetOptions}
                />
              ) : (
                <div className="space-y-1">
                  <Input
                    id="cron-schedule"
                    value={form.schedule}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, schedule: e.target.value }))
                    }
                    placeholder="* * * * *"
                    className="font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Format: minute hour day-of-month month day-of-week
                  </p>
                </div>
              )}
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="cron-tz">Timezone</Label>
              <Select
                id="cron-tz"
                value={form.timezone || "UTC"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timezone: e.target.value }))
                }
                options={timezoneOptions}
              />
            </div>

            {/* Command */}
            <div className="space-y-2">
              <Label htmlFor="cron-command">Command</Label>
              <Input
                id="cron-command"
                value={form.command || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, command: e.target.value }))
                }
                placeholder="e.g., cleanup_old_conversations"
                className="font-mono text-xs"
              />
            </div>

            {/* Skill ID */}
            <div className="space-y-2">
              <Label htmlFor="cron-skill">
                Skill ID{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="cron-skill"
                value={form.skill_id || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, skill_id: e.target.value }))
                }
                placeholder="ID of the skill to execute"
                className="font-mono text-xs"
              />
            </div>

            {/* Max Retries & Timeout */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cron-retries">Max Retries</Label>
                <Input
                  id="cron-retries"
                  type="number"
                  min={0}
                  max={10}
                  value={form.max_retries ?? 3}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      max_retries: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cron-timeout">
                  Timeout{" "}
                  <span className="text-muted-foreground font-normal">(s)</span>
                </Label>
                <Input
                  id="cron-timeout"
                  type="number"
                  min={1}
                  value={form.timeout ?? 300}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      timeout: parseInt(e.target.value) || 300,
                    }))
                  }
                />
              </div>
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="cron-enabled">Enabled</Label>
              <Switch
                id="cron-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, enabled: checked }))
                }
              />
            </div>

            {/* Config JSON */}
            <div className="space-y-2">
              <Label htmlFor="cron-config">Configuration (JSON)</Label>
              <Textarea
                id="cron-config"
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setConfigError(null);
                }}
                placeholder='{"param": "value"}'
                className="font-mono text-xs min-h-[80px]"
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
              disabled={saving || !form.name.trim() || !form.schedule.trim()}
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
