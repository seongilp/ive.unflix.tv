import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { searchVideos, type ShortsCache } from "@/lib/youtube";
import { MEMBERS } from "@/lib/analysis/members";
import { EXT_VIDEOS_KV_KEY } from "../collect/route";

const OFFICIAL_CHANNEL = "UC-Fnix71vRP64WXeo0ikd0Q";
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const PER_QUERY = 8;
const MAX_VIDEOS = 60;
const KV_TTL_SECONDS = 24 * 60 * 60;

function appCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

// GET /api/risk/discover?key=…
// search.list is 100 quota units per query, so this runs on a slow cron (2×/day):
// finds recent NON-official videos (news/issue channels) mentioning the group
// or a member and stores their ids for the risk pass to read comments from.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const expected = process.env.FEED_WARM_KEY;
  if (!expected || searchParams.get("key") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const kv = appCache();
  if (!kv) return NextResponse.json({ error: "KV unavailable" }, { status: 503 });

  const queries = ["아이브 IVE", ...MEMBERS.map((m) => `아이브 ${m.name}`)];
  const publishedAfterMs = Date.now() - LOOKBACK_MS;
  const ids: string[] = [];
  const perQuery: Record<string, number> = {};

  for (const q of queries) {
    try {
      const hits = await searchVideos(q, { publishedAfterMs, maxResults: PER_QUERY });
      let kept = 0;
      for (const h of hits) {
        if (h.channelId === OFFICIAL_CHANNEL) continue; // official is covered already
        if (!ids.includes(h.videoId)) {
          ids.push(h.videoId);
          kept++;
        }
      }
      perQuery[q] = kept;
    } catch {
      perQuery[q] = -1; // quota/API failure for this query — keep going
    }
    if (ids.length >= MAX_VIDEOS) break;
  }

  const list = ids.slice(0, MAX_VIDEOS);
  await kv.put(EXT_VIDEOS_KV_KEY, JSON.stringify(list), {
    expirationTtl: KV_TTL_SECONDS,
  });
  return NextResponse.json({ videos: list.length, perQuery });
}
