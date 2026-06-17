import type { FeedItem, FeedSource } from "./types";
import { ENABLED_SOURCES, FEED_LIMIT } from "./config";
import * as naver from "./sources/naver";
import * as dc from "./sources/dc";
import * as instagram from "./sources/instagram";

// Merge per-source lists into one newest-first, deduped, capped feed.
export function mergeFeedItems(
  lists: FeedItem[][],
  limit = FEED_LIMIT,
): FeedItem[] {
  const byId = new Map<string, FeedItem>();
  // Dedup keeps the FIRST occurrence in stable source order (this runs before
  // the sort), so cross-list duplicates retain the earliest-seen copy.
  for (const list of lists) {
    for (const it of list) {
      if (!byId.has(it.id)) byId.set(it.id, it);
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);
}

interface Adapter {
  fetchItems: () => Promise<FeedItem[]>;
}

const ADAPTERS: Partial<Record<FeedSource, Adapter>> = {
  naver,
  dc,
  instagram,
};

// Run every enabled adapter in parallel; a failing adapter contributes nothing
// (never aborts the merge).
export async function collectFeed(): Promise<FeedItem[]> {
  const adapters = ENABLED_SOURCES.map((s) => ADAPTERS[s]).filter(
    (a): a is Adapter => Boolean(a),
  );
  const results = await Promise.allSettled(adapters.map((a) => a.fetchItems()));
  const lists = results.map((r) => (r.status === "fulfilled" ? r.value : []));
  return mergeFeedItems(lists);
}
