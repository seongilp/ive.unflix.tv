import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  listVideos,
  resolveChannel,
  YoutubeError,
  type ShortsCache,
} from "@/lib/youtube";

const DEFAULT_HANDLE = "helloiamwoninicetomeetyou";

// Considered fresh for 60 min; the KV entry lives a day so a stale copy can be
// served instantly while it revalidates in the background (stale-while-revalidate).
// Longer freshness => fewer YouTube API calls (quota protection). Tune down only
// if content needs to feel more live than hourly.
const FRESH_MS = 60 * 60 * 1000;
const KV_TTL_SECONDS = 24 * 60 * 60;
const EDGE_MAXAGE = 120;

// A failed resolve (handle not found) is cached briefly so a flood of junk
// handles can't keep hammering channels.list and burning quota.
const NOT_FOUND_TTL_SECONDS = 10 * 60;

// Single-flight: a background revalidation holds this lock so a thundering herd
// of stale requests triggers at most one recompute instead of one-per-request.
const REVALIDATE_LOCK_TTL_SECONDS = 90;

// Valid YouTube handle (3-30 chars: letters, digits, . _ -) or a raw channel id
// (UC + 22 url-safe chars). Anything else is rejected before any API call so
// garbage input never costs quota.
const HANDLE_RE = /^@?[A-Za-z0-9._-]{3,30}$/;
const CHANNEL_ID_RE = /^UC[\w-]{22}$/;

function isValidHandle(handle: string): boolean {
  return CHANNEL_ID_RE.test(handle) || HANDLE_RE.test(handle);
}

interface ChannelPayload {
  channel: unknown;
  videos: unknown;
}
interface CacheEntry {
  data: ChannelPayload;
  ts: number;
  // When set, this is a negative (not-found) tombstone, not real data.
  notFound?: boolean;
}

function appCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

function edgeCache(): Cache | undefined {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default;
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

// Fetch fresh data from YouTube and write it to KV with a timestamp. A 404
// (handle not found) is recorded as a short-lived tombstone so repeated junk
// handles don't keep costing quota.
async function compute(
  handle: string,
  kvKey: string,
  kv?: ShortsCache,
  // Off on the request path: skip the per-video Shorts redirect probes (the slow
  // part of a cold load) and classify by duration; a background pass refines.
  probeShorts = true,
): Promise<ChannelPayload> {
  try {
    const channel = await resolveChannel(handle);
    const videos = await listVideos(channel.uploadsPlaylistId, 300, kv, {
      probeShorts,
    });
    const data: ChannelPayload = { channel, videos };
    if (kv) {
      const entry: CacheEntry = { data, ts: Date.now() };
      try {
        await kv.put(kvKey, JSON.stringify(entry), {
          expirationTtl: KV_TTL_SECONDS,
        });
      } catch {
        // ignore
      }
    }
    return data;
  } catch (err) {
    if (kv && err instanceof YoutubeError && err.status === 404) {
      const entry: CacheEntry = {
        data: { channel: null, videos: null },
        ts: Date.now(),
        notFound: true,
      };
      try {
        await kv.put(kvKey, JSON.stringify(entry), {
          expirationTtl: NOT_FOUND_TTL_SECONDS,
        });
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

// Revalidate in the background, but only if no other request already holds the
// lock — collapses a stale-request stampede into a single recompute.
async function revalidateOnce(
  handle: string,
  kvKey: string,
  kv: ShortsCache,
): Promise<void> {
  const lockKey = `${kvKey}:revalidating`;
  try {
    if (await kv.get(lockKey)) return;
    await kv.put(lockKey, "1", { expirationTtl: REVALIDATE_LOCK_TTL_SECONDS });
  } catch {
    // if the lock layer is unavailable, fall through and revalidate anyway
  }
  await compute(handle, kvKey, kv).catch(() => {
    // background revalidation failures are non-fatal; stale data keeps serving
  });
}

// GET /api/channel?handle=@name
// edge (colo) → KV (global, stale-while-revalidate) → YouTube.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle") || DEFAULT_HANDLE;

  // Reject malformed handles before any API call so junk input never costs
  // quota (the search box accepts arbitrary user input).
  const cleaned = handle.trim().replace(/^@/, "");
  if (!isValidHandle(cleaned)) {
    return NextResponse.json({ error: "Invalid channel handle." }, { status: 400 });
  }

  const kvKey = `channel:v2:${handle.toLowerCase()}`;

  const edge = edgeCache();
  if (edge) {
    try {
      const hit = await edge.match(request.url);
      if (hit) return hit;
    } catch {
      // ignore
    }
  }

  const kv = appCache();
  if (kv) {
    try {
      const raw = await kv.get(kvKey);
      if (raw) {
        const entry = JSON.parse(raw) as Partial<CacheEntry>;
        // Negative (not-found) tombstone: short-circuit so junk handles can't
        // re-hit the API until the tombstone expires.
        if (entry && entry.notFound) {
          return NextResponse.json(
            { error: `Channel not found: ${handle}` },
            { status: 404 },
          );
        }
        // Only trust a well-formed entry; anything else falls through to a
        // fresh compute (so stale/old-format entries can't serve "undefined").
        if (entry && entry.data && typeof entry.ts === "number") {
          if (Date.now() - entry.ts > FRESH_MS) {
            bg(revalidateOnce(handle, kvKey, kv));
          }
          return respond(entry.data, request, edge);
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    // Cold miss: respond fast (no Shorts probes), then refine the Shorts
    // classification accurately in the background so the next load is correct.
    // Skip the edge write here so a colo never pins the provisional split.
    const data = await compute(handle, kvKey, kv, false);
    if (kv) bg(compute(handle, kvKey, kv, true).catch(() => {}));
    return respond(data, request, kv ? undefined : edge);
  } catch (err) {
    if (err instanceof YoutubeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected /api/channel error:", err);
    return NextResponse.json(
      { error: "Failed to load channel." },
      { status: 500 },
    );
  }
}

function respond(
  payload: ChannelPayload | undefined,
  request: Request,
  edge?: Cache,
): Response {
  // Never serialize undefined (that produces the body literal "undefined").
  if (!payload) {
    return NextResponse.json(
      { error: "Failed to load channel." },
      { status: 500 },
    );
  }
  const res = NextResponse.json(payload, {
    headers: { "Cache-Control": `public, s-maxage=${EDGE_MAXAGE}` },
  });
  if (edge) bg(edge.put(request.url, res.clone()));
  return res;
}
