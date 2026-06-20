import type { FeedItem } from "../types";
import { truncate } from "../html";
import { KEYWORDS, IG_MEDIA_LIMIT, IG_OFFICIAL_USERNAME } from "../config";

const GRAPH = "https://graph.facebook.com/v21.0";

interface IgMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

// `author` is shown verbatim on the card: the official username for account
// media (e.g. "rescene_official") or the matched "#hashtag" for hashtag media.
export function normalizeInstagram(media: IgMedia[], author: string): FeedItem[] {
  return media.map((m) => {
    const caption = (m.caption ?? "").trim();
    const firstLine = caption.split("\n")[0]?.trim() ?? "";
    // Instagram captions keep newlines; collapse for the snippet.
    const flat = caption.replace(/\s+/g, " ").trim();
    return {
      id: `instagram:${m.id}`,
      source: "instagram" as const,
      author,
      title: truncate(firstLine || "(사진)", 120),
      snippet: truncate(flat, 200),
      url: m.permalink,
      // Prefer the dedicated poster thumbnail (set on videos); for an image
      // that's the media_url; a video with no thumbnail has no usable preview.
      thumbnail: m.thumbnail_url || (m.media_type === "VIDEO" ? undefined : m.media_url),
      publishedAt: Date.parse(m.timestamp) || 0,
    };
  });
}

// Resolve the IG Business user id required by the discovery/hashtag endpoints.
// Prefers an explicit env id; otherwise discovers it from the token's FB Pages.
async function resolveUserId(token: string): Promise<string | null> {
  if (process.env.INSTAGRAM_USER_ID) return process.env.INSTAGRAM_USER_ID;
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { instagram_business_account?: { id: string } }[];
    };
    for (const page of data.data ?? []) {
      const id = page.instagram_business_account?.id;
      if (id) return id;
    }
    return null;
  } catch {
    return null;
  }
}

// Pull a public Business/Creator account's recent media by username via the
// Business Discovery API (the sanctioned way to read another account's posts).
async function fetchBusinessDiscovery(
  userId: string,
  token: string,
  username: string,
): Promise<FeedItem[]> {
  const fields =
    `business_discovery.username(${username})` +
    `{media.limit(${IG_MEDIA_LIMIT})` +
    `{id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const url =
    `${GRAPH}/${userId}?fields=${encodeURIComponent(fields)}` +
    `&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    business_discovery?: { media?: { data?: IgMedia[] } };
  };
  return normalizeInstagram(data.business_discovery?.media?.data ?? [], username);
}

async function fetchHashtag(
  keyword: string,
  userId: string,
  token: string,
): Promise<FeedItem[]> {
  const searchUrl =
    `${GRAPH}/ig_hashtag_search?user_id=${userId}` +
    `&q=${encodeURIComponent(keyword)}&access_token=${encodeURIComponent(token)}`;
  const sres = await fetch(searchUrl);
  if (!sres.ok) return [];
  const sdata = (await sres.json()) as { data?: { id: string }[] };
  const hashtagId = sdata.data?.[0]?.id;
  if (!hashtagId) return [];

  const mediaUrl =
    `${GRAPH}/${hashtagId}/recent_media?user_id=${userId}` +
    `&fields=id,caption,media_type,media_url,permalink,timestamp` +
    `&limit=${IG_MEDIA_LIMIT}&access_token=${encodeURIComponent(token)}`;
  const mres = await fetch(mediaUrl);
  if (!mres.ok) return [];
  const mdata = (await mres.json()) as { data?: IgMedia[] };
  return normalizeInstagram(mdata.data ?? [], `#${keyword}`);
}

// Instagram via the Graph API: the official account's media (Business
// Discovery) plus hashtag search. Disabled (returns []) without a Graph token
// or when the business user id can't be resolved. Each call is independent —
// one failing never blanks the others (merge/dedupe happens upstream).
export async function fetchItems(keywords: string[] = KEYWORDS): Promise<FeedItem[]> {
  const token = process.env.INSTAGRAM_GRAPH_TOKEN;
  if (!token) return [];
  try {
    const userId = await resolveUserId(token);
    if (!userId) return [];
    const tasks = [
      fetchBusinessDiscovery(userId, token, IG_OFFICIAL_USERNAME),
      ...keywords.map((kw) => fetchHashtag(kw, userId, token)),
    ];
    const results = await Promise.allSettled(tasks);
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch {
    return [];
  }
}
