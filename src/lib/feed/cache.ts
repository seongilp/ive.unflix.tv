import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FeedItem } from "./types";
import { collectFeed } from "./aggregate";
import {
  FEED_FRESH_MS,
  FEED_KV_KEY,
  FEED_KV_TTL_SECONDS,
  FEED_REVALIDATE_LOCK_TTL_SECONDS,
} from "./config";

interface FeedCacheEntry {
  items: FeedItem[];
  ts: number;
}

// KVNamespace shape we use (get/put) — matches SHORTS_CACHE.
interface FeedKv {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number },
  ): Promise<void>;
}

function appCache(): FeedKv | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as unknown as FeedKv | undefined;
  } catch {
    return undefined;
  }
}

function bg(promise: Promise<unknown>) {
  try {
    getCloudflareContext().ctx.waitUntil(promise);
  } catch {
    // no waitUntil outside the Worker runtime
  }
}

async function compute(kv?: FeedKv): Promise<FeedItem[]> {
  const items = await collectFeed();
  if (kv) {
    const entry: FeedCacheEntry = { items, ts: Date.now() };
    try {
      await kv.put(FEED_KV_KEY, JSON.stringify(entry), {
        expirationTtl: FEED_KV_TTL_SECONDS,
      });
    } catch {
      // ignore cache write failures
    }
  }
  return items;
}

// Single-flight background revalidation: collapse a stale-request stampede into
// at most one recompute.
async function revalidateOnce(kv: FeedKv): Promise<void> {
  const lockKey = `${FEED_KV_KEY}:revalidating`;
  try {
    if (await kv.get(lockKey)) return;
    await kv.put(lockKey, "1", {
      expirationTtl: FEED_REVALIDATE_LOCK_TTL_SECONDS,
    });
  } catch {
    // if the lock layer is unavailable, revalidate anyway
  }
  await compute(kv).catch(() => {});
}

// Read-through: KV (global, stale-while-revalidate) → live collect.
export async function getCachedFeed(): Promise<FeedItem[]> {
  const kv = appCache();
  if (kv) {
    try {
      const raw = await kv.get(FEED_KV_KEY);
      if (raw) {
        const entry = JSON.parse(raw) as Partial<FeedCacheEntry>;
        if (entry && Array.isArray(entry.items) && typeof entry.ts === "number") {
          if (Date.now() - entry.ts > FEED_FRESH_MS) bg(revalidateOnce(kv));
          return entry.items;
        }
      }
    } catch {
      // fall through to a fresh compute
    }
  }
  return compute(kv);
}
