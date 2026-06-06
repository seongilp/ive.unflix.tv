"use client";

// Loads comments for a video. The first page comes from the shared client cache
// (instant if preloaded); "load more" paginates live from the API.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentItem } from "./types";
import { fetchFirstPage, getCachedFirstPage } from "./commentsCache";

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

  // First page: prefer the client cache, otherwise fetch (and cache).
  useEffect(() => {
    pageTokenRef.current = undefined;
    setError(null);

    if (!videoId) {
      setComments([]);
      setHasMore(false);
      return;
    }

    const cached = getCachedFirstPage(videoId, order);
    if (cached) {
      setComments(cached.comments);
      pageTokenRef.current = cached.nextPageToken;
      setHasMore(Boolean(cached.nextPageToken));
      setLoading(false);
      return;
    }

    let active = true;
    setComments([]);
    setLoading(true);
    fetchFirstPage(videoId, order)
      .then((page) => {
        if (!active) return;
        setComments(page.comments);
        pageTokenRef.current = page.nextPageToken;
        setHasMore(Boolean(page.nextPageToken));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load comments.");
        setHasMore(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [videoId, order]);

  // Subsequent pages stream live from the API (not cached).
  const loadMore = useCallback(async () => {
    if (!videoId || fetchingRef.current || !pageTokenRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const url = new URL("/api/comments", window.location.origin);
      url.searchParams.set("videoId", videoId);
      url.searchParams.set("order", order);
      url.searchParams.set("pageToken", pageTokenRef.current);
      const res = await fetch(url);
      const data = (await res.json()) as {
        comments?: CommentItem[];
        nextPageToken?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load comments.");
      setComments((prev) => [...prev, ...(data.comments ?? [])]);
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
  }, [videoId, order]);

  return { comments, loading, error, hasMore, loadMore };
}
