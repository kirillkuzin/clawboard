"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  useGatewayCrons,
  type GatewayCronJob,
} from "@/hooks/use-gateway-crons";
import { GatewayGuard } from "@/components/gateway-guard";
import { CRON_PRESETS, TIMEZONES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  RefreshCw,
  AlertCircle,
  Search,
  Clock,
  CalendarClock,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Play,
} from "lucide-react";

interface CronFormData {
  name: string;
  schedule: string;
  enabled: boolean;
  command: string;
  description: string;
  timezone: string;
}

const EMPTY_FORM: CronFormData = {
  name: "",
  schedule: "0 * * * *",
  enabled: true,
  command: "",
  description: "",
  timezone: "UTC",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function getScheduleLabel(schedule: string): string {
  const preset = CRON_PRESETS.find((p) => p.value === schedule);
  return preset?.label || schedule;
}

export function CronsSection() {
  return (
    <GatewayGuard>
      <CronsSectionInner />
    </GatewayGuard>
  );
}

function CronsSectionInner() {
  const crons = useGatewayCrons();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CronFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [usePreset, setUsePreset] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUsePreset(true);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((cron: GatewayCronJob) => {
    setEditingId(cron.id);
    setForm({
      name: cron.name,
      schedule: cron.schedule,
      enabled: cron.enabled,
      command: cron.command ?? "",
      description: cron.description ?? "",
      timezone: cron.timezone ?? "UTC",
    });
    setUsePreset(CRON_PRESETS.some((p) => p.value === cron.schedule));
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim() || !form.schedule.trim()) return;
    setSaving(true);
    if (editingId) {
      await crons.updateCron(editingId, form as unknown as Record<string, unknown>);
    } else {
      await crons.addCron(form as unknown as Record<string, unknown>);
    }
    setSaving(false);
    if (!crons.error) {
      setDialogOpen(false);
    }
  }, [form, editingId, crons]);

  const handleDelete = useCallback(
    async (id: string) => {
      await crons.removeCron(id);
      setDeleteConfirm(null);
    },
    [crons]
  );

  const handleRun = useCallback(
    async (id: string) => {
      setRunningId(id);
      await crons.runCron(id);
      setRunningId(null);
    },
    [crons]
  );

  const filteredItems = crons.items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Cron Jobs</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Schedule and manage recurring tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={crons.fetchItems}
            disabled={crons.loading}
          >
            <RefreshCw
              size={14}
              className={cn(crons.loading && "animate-spin")}
            />
            Refresh
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus size={14} />
            Add Cron Job
          </Button>
        </div>
      </div>

      {crons.error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{crons.error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => crons.setError(null)}
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
          placeholder="Search cron jobs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {crons.loading && crons.items.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading cron jobs...
        </div>
      )}

      {/* Empty */}
      {!crons.loading && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <CalendarClock size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {searchQuery ? "No cron jobs match" : "No cron jobs configured"}
          </p>
          {!searchQuery && (
            <Button size="sm" className="mt-4" onClick={openAdd}>
              <Plus size={14} />
              Add Cron Job
            </Button>
          )}
        </div>
      )}

      {/* Cron list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header row */}
        {filteredItems.length > 0 && (
          <div className="grid grid-cols-[1fr_140px_100px_100px_100px_80px] gap-4 px-4 py-3 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:grid">
            <div>Name</div>
            <div>Schedule</div>
            <div>Status</div>
            <div>Last Run</div>
            <div>Next Run</div>
            <div className="text-right">Actions</div>
          </div>
        )}

        {filteredItems.map((cron) => (
          <div
            key={cron.id}
            className="grid grid-cols-1 lg:grid-cols-[1fr_140px_100px_100px_100px_80px] gap-2 lg:gap-4 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors"
          >
            <div className="min-w-0">
              <span className="font-medium text-sm text-foreground">
                {cron.name}
              </span>
              {cron.description && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {cron.description}
                </p>
              )}
            </div>

            <div className="hidden lg:flex flex-col">
              <code className="text-xs font-mono text-foreground bg-muted/50 px-1.5 py-0.5 rounded w-fit">
                {cron.schedule}
              </code>
              <span className="text-xs text-muted-foreground mt-0.5">
                {getScheduleLabel(cron.schedule)}
              </span>
            </div>

            <div className="hidden lg:flex items-center">
              <Badge variant={cron.enabled ? "success" : "secondary"}>
                {cron.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>

            <div className="hidden lg:flex items-center text-xs text-muted-foreground">
              <Clock size={12} className="mr-1" />
              {formatDate(cron.lastRun)}
            </div>

            <div className="hidden lg:flex items-center text-xs text-muted-foreground">
              <CalendarClock size={12} className="mr-1" />
              {cron.enabled ? formatDate(cron.nextRun) : "\u2014"}
            </div>

            <div className="flex items-center justify-end gap-1">
              <button
                onClick={() => handleRun(cron.id)}
                disabled={runningId === cron.id}
                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                aria-label="Run now"
              >
                {runningId === cron.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
              </button>
              <button
                onClick={() => openEdit(cron)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Edit"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setDeleteConfirm(cron.id)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredItems.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          {filteredItems.length} cron job{filteredItems.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Add/Edit Dialog */}
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

            <div className="space-y-2">
              <Label htmlFor="cron-desc">Description</Label>
              <Input
                id="cron-desc"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="What this job does"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Schedule *</Label>
                <button
                  type="button"
                  onClick={() => setUsePreset(!usePreset)}
                  className="text-xs text-primary hover:text-primary/80 underline"
                >
                  {usePreset ? "Custom expression" : "Use preset"}
                </button>
              </div>
              {usePreset ? (
                <Select
                  value={form.schedule}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schedule: e.target.value }))
                  }
                  options={CRON_PRESETS.map((p) => ({
                    value: p.value,
                    label: p.label,
                  }))}
                />
              ) : (
                <Input
                  value={form.schedule}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, schedule: e.target.value }))
                  }
                  placeholder="* * * * *"
                  className="font-mono"
                />
              )}
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select
                value={form.timezone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timezone: e.target.value }))
                }
                options={TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cron-command">Command</Label>
              <Textarea
                id="cron-command"
                value={form.command}
                onChange={(e) =>
                  setForm((f) => ({ ...f, command: e.target.value }))
                }
                placeholder="Command or message to execute"
                className="font-mono text-xs"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Enabled</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, enabled: checked }))
                }
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
              disabled={saving || !form.name.trim() || !form.schedule.trim()}
            >
              {saving && <Loader2 size={14} className="animate-spin mr-1" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent onClose={() => setDeleteConfirm(null)}>
          <DialogHeader>
            <DialogTitle>Delete Cron Job</DialogTitle>
            <DialogDescription>
              Are you sure? This cannot be undone.
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
    </>
  );
}
