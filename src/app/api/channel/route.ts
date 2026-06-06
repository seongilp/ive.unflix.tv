import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  listVideos,
  resolveChannel,
  YoutubeError,
  type ShortsCache,
} from "@/lib/youtube";

const DEFAULT_HANDLE = "helloiamwoninicetomeetyou";

// Considered fresh for 10 min; the KV entry lives a day so a stale copy can be
// served instantly while it revalidates in the background (stale-while-revalidate).
const FRESH_MS = 10 * 60 * 1000;
const KV_TTL_SECONDS = 24 * 60 * 60;
const EDGE_MAXAGE = 120;

interface ChannelPayload {
  channel: unknown;
  videos: unknown;
}
interface CacheEntry {
  data: ChannelPayload;
  ts: number;
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

// Fetch fresh data from YouTube and write it to KV with a timestamp.
async function compute(
  handle: string,
  kvKey: string,
  kv?: ShortsCache,
): Promise<ChannelPayload> {
  const channel = await resolveChannel(handle);
  const videos = await listVideos(channel.uploadsPlaylistId, 300, kv);
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
}

// GET /api/channel?handle=@name
// edge (colo) → KV (global, stale-while-revalidate) → YouTube.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle") || DEFAULT_HANDLE;
  const kvKey = `channel:v1:${handle.toLowerCase()}`;

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
        const entry = JSON.parse(raw) as CacheEntry;
        // Serve immediately; refresh in the background if stale.
        if (Date.now() - entry.ts > FRESH_MS) {
          bg(compute(handle, kvKey, kv));
        }
        return respond(entry.data, request, edge);
      }
    } catch {
      // ignore
    }
  }

  try {
    const data = await compute(handle, kvKey, kv);
    return respond(data, request, edge);
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
  payload: ChannelPayload,
  request: Request,
  edge?: Cache,
): Response {
  const res = NextResponse.json(payload, {
    headers: { "Cache-Control": `public, s-maxage=${EDGE_MAXAGE}` },
  });
  if (edge) bg(edge.put(request.url, res.clone()));
  return res;
}
