import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listComments, YoutubeError, type ShortsCache } from "@/lib/youtube";

// Reuse the app KV namespace for comment-page caching (different key prefix).
function commentsCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

// Cloudflare's colo-local edge cache (fastest layer). Undefined under Node dev.
function edgeCache(): Cache | undefined {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default;
  } catch {
    return undefined;
  }
}

// GET /api/comments?videoId=X&pageToken=Y&order=relevance|time
// Three-layer cache: edge (colo) → KV (global) → YouTube (origin).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const order = searchParams.get("order") === "time" ? "time" : "relevance";

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required." }, { status: 400 });
  }

  // 1) Edge cache hit?
  const edge = edgeCache();
  if (edge) {
    try {
      const hit = await edge.match(request.url);
      if (hit) return hit;
    } catch {
      // ignore edge read failures
    }
  }

  try {
    // 2) KV → 3) YouTube (inside listComments)
    const result = await listComments(
      videoId,
      pageToken,
      order,
      commentsCache(),
    );
    const res = NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=300" },
    });

    // Populate the edge cache without blocking the response.
    if (edge) {
      try {
        getCloudflareContext().ctx.waitUntil(
          edge.put(request.url, res.clone()),
        );
      } catch {
        // ignore edge write failures
      }
    }
    return res;
  } catch (err) {
    if (err instanceof YoutubeError) {
      // Comments disabled is a common, expected case — surface it cleanly.
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected /api/comments error:", err);
    return NextResponse.json(
      { error: "Failed to load comments." },
      { status: 500 },
    );
  }
}
