import type { FeedSource } from "./types";

// Keyword set driving the broad sources (네이버뉴스). DC is already
// group-specific. Append member names here later as needed.
// Korean + romanized terms maximize search breadth across sources.
export const KEYWORDS = ["리센느", "RESCENE"];

// Sources wired AND enabled. 스레드/더쿠/인스티즈 are deferred.
export const ENABLED_SOURCES: FeedSource[] = ["naver", "daum", "dc", "instagram"];

export const FEED_LIMIT = 200;
export const NAVER_PER_KEYWORD = 30;
// Daum web search (Kakao Search API) results per keyword.
export const DAUM_PER_KEYWORD = 25;
export const IG_MEDIA_LIMIT = 25;
// RESCENE official Instagram account, pulled via the Business Discovery API.
export const IG_OFFICIAL_USERNAME = "rescene_official";

// DC 리센느 마이너 갤러리 (verified: gall.dcinside.com/mgallery/board/lists/?id=rescene1).
// "mgallery" = minor gallery (board path /mgallery/board/...),
// "board" = regular gallery (/board/...).
export const DC_GALLERY_ID = "rescene1";
export const DC_GALLERY_TYPE: "mgallery" | "board" = "mgallery";
export const DC_LIST_COUNT = 50;

// KV cache (reuse SHORTS_CACHE namespace with this prefix).
export const FEED_KV_KEY = "feed:v1";
export const FEED_FRESH_MS = 5 * 60 * 1000;
export const FEED_KV_TTL_SECONDS = 24 * 60 * 60;
export const FEED_REVALIDATE_LOCK_TTL_SECONDS = 90;
// `s-maxage` value (seconds) for the /api/feed Cache-Control header.
export const FEED_EDGE_MAXAGE_SECONDS = 60;

// Display labels (Korean) for every source — UI shows labels for ENABLED_SOURCES.
export const SOURCE_LABELS: Record<FeedSource, string> = {
  naver: "네이버뉴스",
  daum: "다음",
  dc: "DC",
  instagram: "인스타",
  threads: "스레드",
  theqoo: "더쿠",
  instiz: "인스티즈",
};
