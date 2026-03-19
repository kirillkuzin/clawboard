"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useCrud } from "@/hooks/use-crud";
import type { Skill, SkillFormData } from "@/lib/types";
import { SKILL_TYPES } from "@/lib/types";
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
  Zap,
  Loader2,
} from "lucide-react";

const EMPTY_FORM: SkillFormData = {
  name: "",
  description: "",
  type: "function",
  enabled: true,
  config: {},
};

export function SkillsSection() {
  const crud = useCrud<Skill>({ basePath: "/api/v1/skills" });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [formData, setFormData] = useState<SkillFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [configText, setConfigText] = useState("{}");

  const openCreate = useCallback(() => {
    setEditingSkill(null);
    setFormData(EMPTY_FORM);
    setConfigText("{}");
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((skill: Skill) => {
    setEditingSkill(skill);
    setFormData({
      name: skill.name,
      description: skill.description || "",
      type: skill.type || "function",
      enabled: skill.enabled !== false,
      config: skill.config || {},
    });
    setConfigText(JSON.stringify(skill.config || {}, null, 2));
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

    const payload = { ...formData, config: parsedConfig };

    if (editingSkill) {
      await crud.updateItem(editingSkill.id, payload);
    } else {
      await crud.createItem(payload);
    }

    setSaving(false);
    setDialogOpen(false);
  }, [formData, configText, editingSkill, crud]);

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
      (item.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.type || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Skills</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage agent skills and capabilities
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
              Add Skill
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
            placeholder="Search skills by name, description, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_100px_100px_80px] gap-4 px-4 py-3 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:grid">
            <div>Name</div>
            <div>Type</div>
            <div>Status</div>
            <div>Updated</div>
            <div className="text-right">Actions</div>
          </div>

          {/* Loading state */}
          {crud.loading && crud.items.length === 0 && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading skills...
            </div>
          )}

          {/* Empty state */}
          {!crud.loading && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Zap size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {searchQuery ? "No skills match your search" : "No skills found"}
              </p>
              <p className="text-xs mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Create your first skill to get started"}
              </p>
              {!searchQuery && (
                <Button size="sm" className="mt-4" onClick={openCreate}>
                  <Plus size={14} />
                  Add Skill
                </Button>
              )}
            </div>
          )}

          {/* Rows */}
          {filteredItems.map((skill) => (
            <div
              key={skill.id}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[1fr_120px_100px_100px_80px] gap-2 md:gap-4 px-4 py-3",
                "border-b border-border/50 last:border-b-0",
                "hover:bg-muted/20 transition-colors duration-150"
              )}
            >
              {/* Name + description */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground truncate">
                    {skill.name}
                  </span>
                  <span className="md:hidden">
                    <Badge
                      variant={skill.enabled !== false ? "success" : "secondary"}
                    >
                      {skill.enabled !== false ? "Active" : "Disabled"}
                    </Badge>
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {skill.description}
                  </p>
                )}
              </div>

              {/* Type */}
              <div className="hidden md:flex items-center">
                <Badge variant="outline" className="text-xs">
                  {skill.type || "function"}
                </Badge>
              </div>

              {/* Status */}
              <div className="hidden md:flex items-center">
                <Badge
                  variant={skill.enabled !== false ? "success" : "secondary"}
                >
                  {skill.enabled !== false ? "Active" : "Disabled"}
                </Badge>
              </div>

              {/* Updated */}
              <div className="hidden md:flex items-center text-xs text-muted-foreground">
                {skill.updated_at
                  ? new Date(skill.updated_at).toLocaleDateString()
                  : "—"}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1">
                <button
                  onClick={() => openEdit(skill)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(skill.id)}
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
            Showing {filteredItems.length} of {crud.items.length} skill
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
              {editingSkill ? "Edit Skill" : "Create Skill"}
            </DialogTitle>
            <DialogDescription>
              {editingSkill
                ? "Update the skill configuration below."
                : "Add a new skill to your OpenClaw instance."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skill-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="skill-name"
                placeholder="e.g., web-search"
                value={formData.name}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-description">Description</Label>
              <Textarea
                id="skill-description"
                placeholder="What does this skill do?"
                rows={2}
                value={formData.description || ""}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="skill-type">Type</Label>
                <Select
                  id="skill-type"
                  value={formData.type || "function"}
                  onChange={(e) =>
                    setFormData((f) => ({ ...f, type: e.target.value }))
                  }
                  options={SKILL_TYPES.map((t) => ({
                    value: t,
                    label: t.charAt(0).toUpperCase() + t.slice(1),
                  }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="skill-enabled">Status</Label>
                <Select
                  id="skill-enabled"
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
              <Label htmlFor="skill-config">
                Configuration (JSON)
              </Label>
              <Textarea
                id="skill-config"
                placeholder='{"key": "value"}'
                rows={4}
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
              {editingSkill ? "Update" : "Create"}
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
            <DialogTitle>Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this skill? This action cannot be
              undone.
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
