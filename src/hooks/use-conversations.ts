"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { openclawFetch } from "@/lib/api-client";
import type {
  Conversation,
  ConversationListResponse,
  ConversationDetailResponse,
} from "@/lib/types/conversation";

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  total: number;
  refresh: () => void;
}

interface UseConversationDetailReturn {
  conversation: ConversationDetailResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Hook to fetch the list of conversations from the OpenClaw API.
 */
export function useConversations(
  page: number = 1,
  pageSize: number = 50
): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const mountedRef = useRef(true);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await openclawFetch(
        `/conversations?page=${page}&page_size=${pageSize}`
      );
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data: ConversationListResponse = await response.json();
      if (mountedRef.current) {
        setConversations(data.conversations ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : "Failed to fetch conversations";
        setError(msg);
        setConversations([]);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [page, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    fetchConversations();

    return () => {
      mountedRef.current = false;
    };
  }, [fetchConversations]);

  return { conversations, loading, error, total, refresh: fetchConversations };
}

/**
 * Hook to fetch a single conversation with its full message thread.
 */
export function useConversationDetail(
  conversationId: string | null
): UseConversationDetailReturn {
  const [conversation, setConversation] =
    useState<ConversationDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const initialLoadDoneRef = useRef(false);

  const fetchDetail = useCallback(async (isPolling = false) => {
    if (!conversationId) {
      setConversation(null);
      return;
    }
    // Only show loading spinner on initial fetch, not polling refreshes
    if (!isPolling) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await openclawFetch(`/conversations/${conversationId}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data: ConversationDetailResponse = await response.json();
      if (mountedRef.current) {
        setConversation(data);
        initialLoadDoneRef.current = true;
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch conversation";
        setError(msg);
      }
    } finally {
      if (mountedRef.current && !isPolling) {
        setLoading(false);
      }
    }
  }, [conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    initialLoadDoneRef.current = false;
    fetchDetail(false);

    // Poll for updates on active conversations
    if (conversationId) {
      pollingRef.current = setInterval(() => fetchDetail(true), 5000);
    }

    return () => {
      mountedRef.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchDetail, conversationId]);

  return {
    conversation,
    loading,
    error,
    refresh: () => fetchDetail(false),
  };
}
