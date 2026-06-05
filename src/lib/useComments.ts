"use client";

// Loads comments for a video page-by-page and exposes the full accumulated
// list at once (for the "쭈르륵" list view), with a loadMore for pagination.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentItem } from "./types";

interface Options {
  videoId: string | null;
  order: "relevance" | "time";
}

export function useComments({ videoId, order }: Options) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const pageTokenRef = useRef<string | undefined>(undefined);
  const fetchingRef = useRef(false);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!videoId || fetchingRef.current) return;
      fetchingRef.current = true;
      setLoading(true);
      try {
        const url = new URL("/api/comments", window.location.origin);
        url.searchParams.set("videoId", videoId);
        url.searchParams.set("order", order);
        if (!reset && pageTokenRef.current) {
          url.searchParams.set("pageToken", pageTokenRef.current);
        }
        const res = await fetch(url);
        const data = (await res.json()) as {
          comments?: CommentItem[];
          nextPageToken?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load comments.");

        const incoming: CommentItem[] = data.comments ?? [];
        setComments((prev) => (reset ? incoming : [...prev, ...incoming]));
        pageTokenRef.current = data.nextPageToken;
        setHasMore(Boolean(data.nextPageToken));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load comments.");
        setHasMore(false);
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    },
    [videoId, order],
  );

  // Reset and load the first page when the video or order changes.
  useEffect(() => {
    pageTokenRef.current = undefined;
    setComments([]);
    setHasMore(false);
    setError(null);
    if (videoId) void fetchPage(true);
  }, [videoId, order, fetchPage]);

  const loadMore = useCallback(() => void fetchPage(false), [fetchPage]);

  return { comments, loading, error, hasMore, loadMore };
}
