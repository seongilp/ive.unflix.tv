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

// GET /api/comments?videoId=X&pageToken=Y&order=relevance|time
// Returns one page of top-level comments for a video (KV-cached, 5-min TTL).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const pageToken = searchParams.get("pageToken") ?? undefined;
  const order = searchParams.get("order") === "time" ? "time" : "relevance";

  if (!videoId) {
    return NextResponse.json({ error: "videoId is required." }, { status: 400 });
  }

  try {
    const result = await listComments(
      videoId,
      pageToken,
      order,
      commentsCache(),
    );
    return NextResponse.json(result);
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
