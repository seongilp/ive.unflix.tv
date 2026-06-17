import type { FeedSource } from "./types";

// Keyword set driving the broad sources (네이버뉴스). DC is already
// group-specific. Append member names here later as needed.
export const KEYWORDS = ["리센느", "RESCENE"];

// Sources wired AND enabled in v1. 스레드/더쿠/인스티즈 are deferred.
export const ENABLED_SOURCES: FeedSource[] = ["naver", "dc", "instagram"];

export const FEED_LIMIT = 200;
export const NAVER_PER_KEYWORD = 30;
export const IG_MEDIA_LIMIT = 25;

// DC RESCENE gallery. VERIFY the real id/type at gall.dcinside.com before
// production. "mgallery" = minor gallery (board path /mgallery/board/...),
// "board" = regular gallery (/board/...).
export const DC_GALLERY_ID = "rescene";
export const DC_GALLERY_TYPE: "mgallery" | "board" = "mgallery";
export const DC_LIST_COUNT = 50;

// KV cache (reuse SHORTS_CACHE namespace with this prefix).
export const FEED_KV_KEY = "feed:v1";
export const FEED_FRESH_MS = 5 * 60 * 1000;
export const FEED_KV_TTL_SECONDS = 24 * 60 * 60;
export const FEED_REVALIDATE_LOCK_TTL_SECONDS = 90;
export const FEED_EDGE_MAXAGE = 60;

// Display labels (Korean) for every source — UI shows labels for ENABLED_SOURCES.
export const SOURCE_LABELS: Record<FeedSource, string> = {
  naver: "네이버뉴스",
  dc: "DC",
  instagram: "인스타",
  threads: "스레드",
  theqoo: "더쿠",
  instiz: "인스티즈",
};
