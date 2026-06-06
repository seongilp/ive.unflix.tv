"use client";

// In-memory client cache for the FIRST page of each video's comments, keyed by
// videoId + order. Populated by background preloading and hover prefetch so
// selecting a video renders instantly with zero network.

import type { CommentItem } from "./types";

export interface CommentPage {
  comments: CommentItem[];
  nextPageToken?: string;
}

const cache = new Map<string, CommentPage>();
const inflight = new Map<string, Promise<CommentPage>>();

function key(videoId: string, order: string): string {
  return `${videoId}:${order}`;
}

export function getCachedFirstPage(
  videoId: string,
  order: string,
): CommentPage | undefined {
  return cache.get(key(videoId, order));
}

// Fetch (or return cached / in-flight) the first comment page for a video.
// Concurrent callers for the same key share one request.
export function fetchFirstPage(
  videoId: string,
  order: string,
): Promise<CommentPage> {
  const k = key(videoId, order);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(k);
  if (pending) return pending;

  const p = (async () => {
    const url = `/api/comments?videoId=${encodeURIComponent(videoId)}&order=${order}`;
    const res = await fetch(url);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to load comments.");
    }
    const data = (await res.json()) as CommentPage;
    cache.set(k, data);
    return data;
  })();

  inflight.set(k, p);
  p.catch(() => undefined).finally(() => inflight.delete(k));
  return p;
}

// Preload first pages for many videos with bounded concurrency. Returns a
// cancel function; cancelling stops scheduling further fetches.
export function preloadFirstPages(
  videoIds: string[],
  order: string,
  concurrency = 5,
): () => void {
  let cancelled = false;
  let cursor = 0;

  async function worker() {
    while (!cancelled && cursor < videoIds.length) {
      const id = videoIds[cursor++];
      try {
        await fetchFirstPage(id, order);
      } catch {
        // ignore individual failures
      }
    }
  }

  for (let i = 0; i < Math.min(concurrency, videoIds.length); i++) {
    void worker();
  }

  return () => {
    cancelled = true;
  };
}
