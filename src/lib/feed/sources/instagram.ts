import type { FeedItem } from "../types";
import { truncate } from "../html";
import { IG_OFFICIAL_USERNAME, IG_MEDIA_LIMIT } from "../config";

// Public web app id instagram.com itself sends on its logged-out web API.
// No user token required — this reads a public profile's recent posts.
const IG_APP_ID = "936619743392459";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

interface IgNode {
  id: string;
  shortcode: string;
  display_url?: string;
  thumbnail_src?: string;
  is_video?: boolean;
  taken_at_timestamp: number;
  edge_media_to_caption?: { edges?: { node?: { text?: string } }[] };
}

interface IgWebProfile {
  data?: {
    user?: {
      edge_owner_to_timeline_media?: { edges?: { node: IgNode }[] };
    };
  };
}

export function normalizeIgWebProfile(
  json: IgWebProfile,
  username: string,
): FeedItem[] {
  const edges = json.data?.user?.edge_owner_to_timeline_media?.edges ?? [];
  return edges.map(({ node: n }) => {
    const caption = (n.edge_media_to_caption?.edges?.[0]?.node?.text ?? "").trim();
    const firstLine = caption.split("\n")[0]?.trim() ?? "";
    const flat = caption.replace(/\s+/g, " ").trim();
    return {
      id: `instagram:${n.id}`,
      source: "instagram" as const,
      author: username,
      title: truncate(firstLine || "(사진)", 120),
      snippet: truncate(flat, 200),
      url: `https://www.instagram.com/p/${n.shortcode}/`,
      // display_url is the poster image for both photos and videos.
      thumbnail: n.display_url || n.thumbnail_src,
      publishedAt: (n.taken_at_timestamp || 0) * 1000,
    };
  });
}

// Reads the official account's public posts via Instagram's logged-out web API
// — no token. Best-effort: Instagram may block datacenter IPs, in which case
// this returns [] and the rest of the feed is unaffected.
export async function fetchItems(): Promise<FeedItem[]> {
  try {
    const url =
      `https://www.instagram.com/api/v1/users/web_profile_info/` +
      `?username=${encodeURIComponent(IG_OFFICIAL_USERNAME)}`;
    const res = await fetch(url, {
      headers: {
        "x-ig-app-id": IG_APP_ID,
        "User-Agent": UA,
        Referer: `https://www.instagram.com/${IG_OFFICIAL_USERNAME}/`,
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as IgWebProfile;
    return normalizeIgWebProfile(json, IG_OFFICIAL_USERNAME).slice(0, IG_MEDIA_LIMIT);
  } catch {
    return [];
  }
}
