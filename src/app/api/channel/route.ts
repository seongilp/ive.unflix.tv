import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  listVideos,
  resolveChannel,
  YoutubeError,
  type ShortsCache,
} from "@/lib/youtube";

const DEFAULT_HANDLE = "helloiamwoninicetomeetyou";

// Grab the SHORTS_CACHE KV binding when running on Cloudflare; undefined under
// a plain Node `next dev` without bindings (caching is then simply skipped).
function shortsCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

// GET /api/channel?handle=@name
// Returns channel info plus the full list of uploads (videos + Shorts).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("handle") || DEFAULT_HANDLE;

  try {
    const channel = await resolveChannel(handle);
    const videos = await listVideos(
      channel.uploadsPlaylistId,
      300,
      shortsCache(),
    );
    return NextResponse.json({ channel, videos });
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
