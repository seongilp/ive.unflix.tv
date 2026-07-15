import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FeedItem } from "../types";
import { truncate } from "../html";
import { IG_USERNAMES, IG_MEDIA_LIMIT, IG_STATE_KV_KEY } from "../config";

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

// One account's public posts via Instagram's logged-out web API — no token.
async function fetchProfile(username: string): Promise<FeedItem[]> {
  const url =
    `https://www.instagram.com/api/v1/users/web_profile_info/` +
    `?username=${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: {
      "x-ig-app-id": IG_APP_ID,
      "User-Agent": UA,
      Referer: `https://www.instagram.com/${username}/`,
      "Accept-Language": "ko-KR,ko;q=0.9",
    },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as IgWebProfile;
  return normalizeIgWebProfile(json, username).slice(0, IG_MEDIA_LIMIT);
}

interface StateKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

const IG_STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const cursorKey = `${IG_STATE_KV_KEY}:cursor`;
const accountKey = (username: string) => `${IG_STATE_KV_KEY}:u:${username}`;

function stateKv(): StateKv | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as unknown as StateKv | undefined;
  } catch {
    return undefined;
  }
}

async function readCursor(kv: StateKv): Promise<number> {
  try {
    const raw = await kv.get(cursorKey);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  } catch {
    // fall through
  }
  return 0;
}

async function readAccount(kv: StateKv, username: string): Promise<FeedItem[]> {
  try {
    const raw = await kv.get(accountKey(username));
    const items = raw ? (JSON.parse(raw) as FeedItem[]) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

// Fetch one account NOW and persist it under its KV key. Used by the guarded
// /api/feed/warm route to (re)fill accounts without waiting for the rotation.
// Returns the number of items stored (0 = blocked/empty, previous items kept).
export async function warmAccount(username: string): Promise<number> {
  const kv = stateKv();
  const items = await fetchProfile(username);
  if (kv && items.length > 0) {
    await kv.put(accountKey(username), JSON.stringify(items), {
      expirationTtl: IG_STATE_TTL_SECONDS,
    });
  }
  return items.length;
}

// Stored item count per account (for the warm route's status report).
export async function accountStatus(): Promise<Record<string, number>> {
  const kv = stateKv();
  const out: Record<string, number> = {};
  for (const u of IG_USERNAMES) {
    out[u] = kv ? (await readAccount(kv, u)).length : 0;
  }
  return out;
}

// Instagram's logged-out API rate-limits bursts hard ("Please wait a few
// minutes…"), so each feed refresh fetches exactly ONE account, round-robin.
// With the feed's 5-minute cache this stays ≤1 request per 5 minutes; all 7
// accounts cycle in ~35 minutes.
//
// Every account is stored under its OWN KV key. KV is eventually consistent
// across colos, so a single all-accounts blob gets clobbered whenever a colo
// revalidates from a stale read (observed: the accumulated state kept
// resetting). Per-account keys make writes disjoint — a stale colo can at
// worst rewrite one account or regress the cursor (harmless rotation jitter),
// never wipe the accumulation.
export async function fetchItems(): Promise<FeedItem[]> {
  const kv = stateKv();

  // No KV (plain node dev/tests): single polite request for the first account.
  if (!kv) {
    try {
      return await fetchProfile(IG_USERNAMES[0]);
    } catch {
      return [];
    }
  }

  const cursor = await readCursor(kv);
  const username = IG_USERNAMES[cursor % IG_USERNAMES.length];
  try {
    const items = await fetchProfile(username);
    if (items.length > 0) {
      await kv.put(accountKey(username), JSON.stringify(items), {
        expirationTtl: IG_STATE_TTL_SECONDS,
      });
    }
  } catch {
    // blocked/failed → the account keeps its previously stored items
  }
  try {
    await kv.put(cursorKey, String((cursor + 1) % IG_USERNAMES.length), {
      expirationTtl: IG_STATE_TTL_SECONDS,
    });
  } catch {
    // cursor write failures just slow the rotation down
  }

  const perAccount = await Promise.all(
    IG_USERNAMES.map((u) => readAccount(kv, u)),
  );
  return perAccount.flat();
}
