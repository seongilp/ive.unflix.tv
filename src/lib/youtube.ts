// Thin wrapper around the YouTube Data API v3.
// All functions throw YoutubeError on non-2xx responses so callers can map
// to clean HTTP responses.

import type { ChannelInfo, ClipKind, CommentItem, VideoSummary } from "./types";

// Duration-only fallback threshold (used when the redirect probe fails).
const SHORT_FALLBACK_SECONDS = 60;

// Cap new redirect probes per request so a cold load stays under Cloudflare's
// per-request subrequest limit; the rest fill in on subsequent loads via KV.
const MAX_NEW_PROBES = 45;

// Minimal KV-shaped cache (a Workers KVNamespace satisfies this).
export interface ShortsCache {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

// Parse an ISO-8601 duration (e.g. "PT1M5S", "PT45S", "PT1H2M") to seconds.
function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, h, min, s] = m;
  return (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
}

const API_BASE = "https://www.googleapis.com/youtube/v3";

export class YoutubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "YoutubeError";
  }
}

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new YoutubeError(
      "YOUTUBE_API_KEY is not configured on the server.",
      500,
    );
  }
  return key;
}

async function call<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  url.search = new URLSearchParams({ ...params, key: apiKey() }).toString();

  const res = await fetch(url, { next: { revalidate: 0 } });
  const body = (await res.json()) as {
    error?: { errors?: Array<{ reason?: string }>; message?: string };
  };

  if (!res.ok) {
    const reason: string =
      body?.error?.errors?.[0]?.reason ?? body?.error?.message ?? res.statusText;
    throw new YoutubeError(`YouTube API error: ${reason}`, res.status);
  }
  return body as T;
}

// Resolve a channel from a handle ("@name" or "name") or a raw channel ID.
export async function resolveChannel(handleOrId: string): Promise<ChannelInfo> {
  const cleaned = handleOrId.trim().replace(/^@/, "");
  const isChannelId = /^UC[\w-]{22}$/.test(cleaned);

  const params: Record<string, string> = isChannelId
    ? { part: "snippet,contentDetails", id: cleaned }
    : { part: "snippet,contentDetails", forHandle: cleaned };

  const data = await call<{
    items?: Array<{
      id: string;
      snippet: {
        title: string;
        customUrl?: string;
        thumbnails: { default?: { url: string }; medium?: { url: string } };
      };
      contentDetails: { relatedPlaylists: { uploads: string } };
    }>;
  }>("channels", params);

  const item = data.items?.[0];
  if (!item) {
    throw new YoutubeError(`Channel not found: ${handleOrId}`, 404);
  }

  return {
    id: item.id,
    title: item.snippet.title,
    handle: item.snippet.customUrl ?? `@${cleaned}`,
    thumbnail:
      item.snippet.thumbnails.medium?.url ??
      item.snippet.thumbnails.default?.url ??
      "",
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
  };
}

// List a channel's uploads (paginated across the whole playlist, up to `cap`),
// classified into videos vs Shorts and sorted by release date (oldest first).
export async function listVideos(
  uploadsPlaylistId: string,
  cap = 300,
  cache?: ShortsCache,
): Promise<VideoSummary[]> {
  const items: Array<{
    id: string;
    title: string;
    thumbnail: string;
    publishedAt: string;
  }> = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await call<{
      nextPageToken?: string;
      items?: Array<{
        contentDetails: { videoId: string; videoPublishedAt?: string };
        snippet: {
          title: string;
          thumbnails: { medium?: { url: string }; default?: { url: string } };
        };
      }>;
    }>("playlistItems", params);

    for (const item of data.items ?? []) {
      items.push({
        id: item.contentDetails.videoId,
        title: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails.medium?.url ??
          item.snippet.thumbnails.default?.url ??
          "",
        publishedAt: item.contentDetails.videoPublishedAt ?? "",
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken && items.length < cap);

  const ids = items.map((v) => v.id);
  // Batched lookups for duration + statistics (50 ids per call).
  const meta = await fetchVideoMeta(ids);
  const durations = new Map(
    [...meta].map(([id, m]) => [id, m.durationSeconds] as const),
  );
  // Accurate Shorts detection via the /shorts/ redirect probe, cached in KV.
  const shortMap = await classifyShorts(
    ids,
    durations,
    cache,
    `shorts:v1:${uploadsPlaylistId}`,
  );

  const videos: VideoSummary[] = items.map((v) => {
    const m = meta.get(v.id);
    const kind: ClipKind = shortMap.get(v.id) ? "short" : "video";
    return {
      ...v,
      durationSeconds: m?.durationSeconds ?? 0,
      kind,
      viewCount: m?.viewCount ?? 0,
      likeCount: m?.likeCount ?? 0,
      commentCount: m?.commentCount ?? 0,
    };
  });

  // Release order, newest first (#1 = latest upload).
  return videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

// Probe youtube.com/shorts/{id}: a real Short returns 200, a regular video
// redirects (3xx) to /watch. Falls back to the duration heuristic on failure.
async function probeIsShort(
  id: string,
  durationSeconds: number,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`https://www.youtube.com/shorts/${id}`, {
      redirect: "manual",
      signal: ctrl.signal,
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0" },
    });
    r.body?.cancel?.();
    if (r.status === 200) return true;
    if (r.status >= 300 && r.status < 400) return false;
  } catch {
    // fall through to duration heuristic
  } finally {
    clearTimeout(timer);
  }
  return durationSeconds > 0 && durationSeconds <= SHORT_FALLBACK_SECONDS;
}

// Classify ids as Short vs video. Cached classifications come from KV; only
// the unknown ids are probed (capped at MAX_NEW_PROBES per request to respect
// Cloudflare's subrequest limit), and newly probed results are written back.
async function classifyShorts(
  ids: string[],
  durations: Map<string, number>,
  cache?: ShortsCache,
  cacheKey?: string,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();

  // 1) Seed from KV.
  const known: Record<string, boolean> = {};
  if (cache && cacheKey) {
    try {
      const raw = await cache.get(cacheKey);
      if (raw) Object.assign(known, JSON.parse(raw));
    } catch {
      // ignore cache read failures
    }
  }

  const unknown: string[] = [];
  for (const id of ids) {
    if (typeof known[id] === "boolean") out.set(id, known[id]);
    else unknown.push(id);
  }

  // 2) Probe up to the cap; the overflow uses the duration fallback this round
  //    (not cached, so it gets probed accurately on a later request).
  const probeNow = unknown.slice(0, MAX_NEW_PROBES);
  const overflow = unknown.slice(MAX_NEW_PROBES);

  const CONCURRENCY = 16;
  let cursor = 0;
  async function worker() {
    while (cursor < probeNow.length) {
      const id = probeNow[cursor++];
      const isShort = await probeIsShort(id, durations.get(id) ?? 0);
      out.set(id, isShort);
      known[id] = isShort;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, probeNow.length) }, worker),
  );

  for (const id of overflow) {
    const d = durations.get(id) ?? 0;
    out.set(id, d > 0 && d <= SHORT_FALLBACK_SECONDS);
  }

  // 3) Persist the merged map (1-day TTL).
  if (cache && cacheKey && probeNow.length > 0) {
    try {
      await cache.put(cacheKey, JSON.stringify(known), {
        expirationTtl: 86400,
      });
    } catch {
      // ignore cache write failures
    }
  }

  return out;
}

interface VideoMeta {
  durationSeconds: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

// Batch-fetch duration + statistics keyed by video id. The videos endpoint
// accepts up to 50 ids per call, so we chunk.
async function fetchVideoMeta(ids: string[]): Promise<Map<string, VideoMeta>> {
  const out = new Map<string, VideoMeta>();

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await call<{
      items?: Array<{
        id: string;
        contentDetails: { duration: string };
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    }>("videos", {
      part: "contentDetails,statistics",
      id: chunk.join(","),
      maxResults: "50",
    });

    for (const item of data.items ?? []) {
      out.set(item.id, {
        durationSeconds: parseIsoDuration(item.contentDetails.duration),
        viewCount: Number(item.statistics?.viewCount ?? 0),
        likeCount: Number(item.statistics?.likeCount ?? 0),
        commentCount: Number(item.statistics?.commentCount ?? 0),
      });
    }
  }
  return out;
}

// Fetch top-level comments for a video. Supports pagination via pageToken.
export async function listComments(
  videoId: string,
  pageToken?: string,
  order: "relevance" | "time" = "relevance",
): Promise<{ comments: CommentItem[]; nextPageToken?: string }> {
  const params: Record<string, string> = {
    part: "snippet",
    videoId,
    maxResults: "100",
    order,
    textFormat: "plainText",
  };
  if (pageToken) params.pageToken = pageToken;

  const data = await call<{
    nextPageToken?: string;
    items?: Array<{
      id: string;
      snippet: {
        topLevelComment: {
          snippet: {
            authorDisplayName: string;
            authorProfileImageUrl: string;
            textDisplay: string;
            likeCount: number;
            publishedAt: string;
          };
        };
      };
    }>;
  }>("commentThreads", params);

  const comments: CommentItem[] = (data.items ?? []).map((item) => {
    const s = item.snippet.topLevelComment.snippet;
    return {
      id: item.id,
      author: s.authorDisplayName,
      authorThumbnail: s.authorProfileImageUrl,
      text: s.textDisplay,
      likeCount: s.likeCount,
      publishedAt: s.publishedAt,
    };
  });

  return { comments, nextPageToken: data.nextPageToken };
}
