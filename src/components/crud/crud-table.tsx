"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  AlertCircle,
  Loader2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface CrudTableProps<T extends { id: string }> {
  title: string;
  description: string;
  items: T[];
  columns: Column<T>[];
  loading: boolean;
  error: string | null;
  operationLoading?: boolean;
  onAdd: () => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  onRefresh: () => void;
  onClearError: () => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  addLabel?: string;
}

export function CrudTable<T extends { id: string }>({
  title,
  description,
  items,
  columns,
  loading,
  error,
  operationLoading,
  onAdd,
  onEdit,
  onDelete,
  onRefresh,
  onClearError,
  searchPlaceholder = "Search...",
  emptyMessage = "No items found",
  addLabel = "Add New",
}: CrudTableProps<T>) {
  const [search, setSearch] = React.useState("");
  const [deleteConfirm, setDeleteConfirm] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => {
      return columns.some((col) => {
        const val = (item as Record<string, unknown>)[col.key];
        if (typeof val === "string") return val.toLowerCase().includes(q);
        if (typeof val === "boolean") return (val ? "enabled" : "disabled").includes(q);
        return false;
      });
    });
  }, [items, search, columns]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw
              size={14}
              className={cn(loading && "animate-spin")}
            />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>
          <Button size="sm" onClick={onAdd} disabled={operationLoading}>
            <Plus size={14} />
            <span className="ml-1">{addLabel}</span>
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle size={16} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={onClearError}
            className="text-destructive/70 hover:text-destructive text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">{search ? "No matching results" : emptyMessage}</p>
          {!search && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              className="mt-3"
            >
              <Plus size={14} />
              <span className="ml-1">{addLabel}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-4 py-3 text-left font-medium text-muted-foreground",
                        col.className
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-24">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn("px-4 py-3", col.className)}
                      >
                        {col.render
                          ? col.render(item)
                          : String(
                              (item as Record<string, unknown>)[col.key] ?? ""
                            )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(item)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </Button>
                        {deleteConfirm === item.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                onDelete(item);
                                setDeleteConfirm(null);
                              }}
                              className="h-8 text-xs"
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm(null)}
                              className="h-8 text-xs"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirm(item.id)}
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border/50 bg-muted/10">
            {filtered.length} of {items.length} item{items.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

/** Helper to render an enabled/disabled badge */
export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge variant={enabled ? "success" : "secondary"}>
      {enabled ? "Enabled" : "Disabled"}
    </Badge>
  );
}
