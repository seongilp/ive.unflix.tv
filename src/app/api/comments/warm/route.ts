import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listComments, YoutubeError, type ShortsCache } from "@/lib/youtube";

// IVE 공식 채널 — matches the UI's default preset.
const DEFAULT_CHANNEL = "UC-Fnix71vRP64WXeo0ikd0Q";
// Videos per call, capped low to stay well under the Workers subrequest
// budget (each video ≈ 1 KV read + 1 YouTube fetch + 1 KV write).
const DEFAULT_BATCH = 12;
const MAX_BATCH = 15;

interface ChannelCacheEntry {
  data?: { videos?: Array<{ id?: string }> };
}

function appCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

// GET /api/comments/warm?key=…&start=0&batch=12[&handle=UC…]
// Guarded ops endpoint: prewarms the KV comment cache (first "relevance"
// page per video) in batches, so real visitors get instant comment loads
// instead of each browser dragging 300 pages out of YouTube itself.
// Drive it with successive calls (start = previous response's `next`).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const expected = process.env.FEED_WARM_KEY;
  if (!expected || searchParams.get("key") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const handle = searchParams.get("handle") ?? DEFAULT_CHANNEL;
  const start = Math.max(0, Number(searchParams.get("start") ?? 0) || 0);
  const batch = Math.min(
    MAX_BATCH,
    Math.max(1, Number(searchParams.get("batch") ?? DEFAULT_BATCH) || DEFAULT_BATCH),
  );

  const kv = appCache();
  if (!kv) {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 });
  }

  // Video list comes from the /api/channel KV entry (don't burn quota
  // re-listing here) — visit the site once (or call /api/channel) to seed it.
  let ids: string[] = [];
  try {
    const raw = await kv.get(`channel:v2:${handle.toLowerCase()}`);
    const entry = raw ? (JSON.parse(raw) as ChannelCacheEntry) : undefined;
    ids = (entry?.data?.videos ?? [])
      .map((v) => v?.id)
      .filter((id): id is string => Boolean(id));
  } catch {
    // fall through to the empty-ids error below
  }
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "channel cache empty — GET /api/channel first" },
      { status: 409 },
    );
  }

  const slice = ids.slice(start, start + batch);
  let warmed = 0;
  let failed = 0;
  for (const id of slice) {
    try {
      await listComments(id, undefined, "relevance", kv);
      warmed++;
    } catch (err) {
      // Comments disabled (403) etc. — skip; a dead video must not stall the pass.
      failed++;
      if (!(err instanceof YoutubeError)) {
        console.error("comments warm error:", id, err);
      }
    }
  }

  const next = start + slice.length;
  return NextResponse.json({
    start,
    warmed,
    failed,
    next,
    total: ids.length,
    done: next >= ids.length,
  });
}
