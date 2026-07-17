import type { FeedItem, FeedSource } from "./types";
import { ENABLED_SOURCES, FEED_LIMIT, FEED_PER_SOURCE_LIMIT } from "./config";
import * as naver from "./sources/naver";
import * as daum from "./sources/daum";
import * as dc from "./sources/dc";
import * as instagram from "./sources/instagram";
import * as pann from "./sources/pann";

// Merge per-source lists into one newest-first, deduped feed. The cap is
// applied PER SOURCE (newest first), not globally — a high-volume source
// (news) must not crowd a low-volume one (a member's weeks-old Instagram
// post) out of the feed entirely.
export function mergeFeedItems(
  lists: FeedItem[][],
  limit = FEED_LIMIT,
  perSourceLimit = FEED_PER_SOURCE_LIMIT,
): FeedItem[] {
  const byId = new Map<string, FeedItem>();
  // Dedup keeps the FIRST occurrence in stable source order (this runs before
  // the sort), so cross-list duplicates retain the earliest-seen copy.
  for (const list of lists) {
    for (const it of list) {
      if (!byId.has(it.id)) byId.set(it.id, it);
    }
  }
  const bySource = new Map<string, FeedItem[]>();
  for (const it of byId.values()) {
    const group = bySource.get(it.source);
    if (group) group.push(it);
    else bySource.set(it.source, [it]);
  }
  const capped: FeedItem[] = [];
  for (const group of bySource.values()) {
    capped.push(
      ...group
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, perSourceLimit),
    );
  }
  return capped
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);
}

interface Adapter {
  fetchItems: () => Promise<FeedItem[]>;
}

const ADAPTERS: Partial<Record<FeedSource, Adapter>> = {
  naver,
  daum,
  dc,
  instagram,
  pann,
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
