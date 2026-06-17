import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed/cache";
import { FEED_EDGE_MAXAGE_SECONDS } from "@/lib/feed/config";
import type { FeedSource } from "@/lib/feed/types";

// GET /api/feed?source=all|naver|dc|instagram
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") ?? "all";
  try {
    const all = await getCachedFeed();
    const items =
      source === "all"
        ? all
        : all.filter((i) => i.source === (source as FeedSource));
    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": `public, s-maxage=${FEED_EDGE_MAXAGE_SECONDS}` } },
    );
  } catch (err) {
    console.error("/api/feed error:", err);
    return NextResponse.json({ error: "Failed to load feed." }, { status: 500 });
  }
}
