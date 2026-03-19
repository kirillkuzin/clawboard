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
      setConversations(data.conversations ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch conversations";
      setError(msg);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchConversations();
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

  const fetchDetail = useCallback(async () => {
    if (!conversationId) {
      setConversation(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await openclawFetch(`/conversations/${conversationId}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      const data: ConversationDetailResponse = await response.json();
      setConversation(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch conversation";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchDetail();

    // Poll for updates on active conversations
    if (conversationId) {
      pollingRef.current = setInterval(fetchDetail, 5000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [fetchDetail, conversationId]);

  return { conversation, loading, error, refresh: fetchDetail };
}
