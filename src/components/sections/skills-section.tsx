"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useGatewaySkills, type GatewaySkill } from "@/hooks/use-gateway-skills";
import { GatewayGuard } from "@/components/gateway-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Zap,
  Loader2,
  Download,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

export function SkillsSection() {
  return (
    <GatewayGuard>
      <SkillsSectionInner />
    </GatewayGuard>
  );
}

function SkillsSectionInner() {
  const skills = useGatewaySkills();
  const [searchQuery, setSearchQuery] = useState("");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installName, setInstallName] = useState("");
  const [installing, setInstalling] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleInstall = useCallback(async () => {
    if (!installName.trim()) return;
    setInstalling(true);
    const ok = await skills.installSkill(installName.trim());
    setInstalling(false);
    if (ok) {
      setInstallDialogOpen(false);
      setInstallName("");
    }
  }, [installName, skills]);

  const handleToggle = useCallback(
    async (skill: GatewaySkill) => {
      const key = skill.key ?? skill.name;
      setTogglingId(skill.id);
      await skills.updateSkill(key, { enabled: !skill.enabled });
      setTogglingId(null);
    },
    [skills]
  );

  const filteredItems = skills.items.filter(
    (item) =>
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
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
              onClick={skills.fetchItems}
              disabled={skills.loading}
            >
              <RefreshCw
                size={14}
                className={cn(skills.loading && "animate-spin")}
              />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setInstallDialogOpen(true)}>
              <Download size={14} />
              Install Skill
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {skills.error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{skills.error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => skills.setError(null)}
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
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_100px_80px] gap-4 px-4 py-3 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:grid">
            <div>Name</div>
            <div>Installed</div>
            <div>Status</div>
            <div className="text-right">Toggle</div>
          </div>

          {skills.loading && skills.items.length === 0 && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" />
              Loading skills...
            </div>
          )}

          {!skills.loading && filteredItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Zap size={40} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">
                {searchQuery
                  ? "No skills match your search"
                  : "No skills found"}
              </p>
              <p className="text-xs mt-1">
                {searchQuery
                  ? "Try a different search term"
                  : "Install a skill to get started"}
              </p>
            </div>
          )}

          {filteredItems.map((skill) => (
            <div
              key={skill.id}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[1fr_100px_100px_80px] gap-2 md:gap-4 px-4 py-3",
                "border-b border-border/50 last:border-b-0",
                "hover:bg-muted/20 transition-colors duration-150"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground truncate">
                    {skill.name}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {skill.description}
                  </p>
                )}
              </div>

              <div className="hidden md:flex items-center">
                <Badge variant={skill.installed ? "success" : "secondary"}>
                  {skill.installed ? "Installed" : "Not installed"}
                </Badge>
              </div>

              <div className="hidden md:flex items-center">
                <Badge variant={skill.enabled ? "success" : "secondary"}>
                  {skill.enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>

              <div className="flex items-center justify-end">
                <button
                  onClick={() => handleToggle(skill)}
                  disabled={togglingId === skill.id}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  aria-label={skill.enabled ? "Disable" : "Enable"}
                >
                  {togglingId === skill.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : skill.enabled ? (
                    <ToggleRight size={18} className="text-primary" />
                  ) : (
                    <ToggleLeft size={18} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredItems.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Showing {filteredItems.length} of {skills.items.length} skill
            {skills.items.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Install Skill Dialog */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent onClose={() => setInstallDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Install Skill</DialogTitle>
            <DialogDescription>
              Enter the skill name to install from the OpenClaw skill registry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="install-name">Skill Name</Label>
              <Input
                id="install-name"
                placeholder="e.g., web-search"
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInstallDialogOpen(false)}
              disabled={installing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInstall}
              disabled={installing || !installName.trim()}
            >
              {installing && <Loader2 size={14} className="animate-spin" />}
              Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
