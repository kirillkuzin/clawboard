"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { openclawFetch } from "@/lib/api-client";

/**
 * Generic CRUD hook for OpenClaw API resources.
 * Handles list, create, update, delete with loading/error states.
 */

interface UseCrudOptions {
  /** Base API path, e.g. "/api/v1/skills" */
  basePath: string;
  /** Auto-fetch on mount */
  autoFetch?: boolean;
}

interface CrudState<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
}

/**
 * Normalize API list responses - OpenClaw may return arrays or
 * objects with items/data/results keys.
 */
function normalizeList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "data", "results", "skills", "providers", "channels", "webhooks", "plugins", "crons"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

function extractError(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    return (
      (obj.error as string) ||
      (obj.detail as string) ||
      (obj.message as string) ||
      ""
    );
  }
  return "";
}

export function useCrud<T extends { id: string }>(options: UseCrudOptions) {
  const { basePath, autoFetch = true } = options;
  const [state, setState] = useState<CrudState<T>>({
    items: [],
    loading: false,
    error: null,
    lastFetched: null,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setError = useCallback((error: string | null) => {
    if (mountedRef.current) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await openclawFetch(basePath);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = extractError(errData) || `Failed to fetch (HTTP ${res.status})`;
        if (mountedRef.current) {
          setState((s) => ({ ...s, loading: false, error: msg }));
        }
        return;
      }
      const data = await res.json();
      const items = normalizeList<T>(data);
      if (mountedRef.current) {
        setState({
          items,
          loading: false,
          error: null,
          lastFetched: Date.now(),
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch",
        }));
      }
    }
  }, [basePath]);

  const createItem = useCallback(
    async (payload: Record<string, unknown>): Promise<T | null> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const res = await openclawFetch(basePath, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = extractError(errData) || `Failed to create (HTTP ${res.status})`;
          setError(msg);
          return null;
        }
        const created = (await res.json()) as T;
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            items: [...s.items, created],
            error: null,
          }));
        }
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create");
        return null;
      }
    },
    [basePath, setError]
  );

  const updateItem = useCallback(
    async (id: string, payload: Record<string, unknown>): Promise<T | null> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const res = await openclawFetch(`${basePath}/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = extractError(errData) || `Failed to update (HTTP ${res.status})`;
          setError(msg);
          return null;
        }
        const updated = (await res.json()) as T;
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            items: s.items.map((item) => (item.id === id ? updated : item)),
            error: null,
          }));
        }
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
        return null;
      }
    },
    [basePath, setError]
  );

  const deleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      setState((s) => ({ ...s, error: null }));
      try {
        const res = await openclawFetch(`${basePath}/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = extractError(errData) || `Failed to delete (HTTP ${res.status})`;
          setError(msg);
          return false;
        }
        if (mountedRef.current) {
          setState((s) => ({
            ...s,
            items: s.items.filter((item) => item.id !== id),
            error: null,
          }));
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete");
        return false;
      }
    },
    [basePath, setError]
  );

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchItems();
    }
  }, [autoFetch, fetchItems]);

  return {
    ...state,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    setError,
  };
}
