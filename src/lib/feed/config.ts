import type { FeedSource } from "./types";

// Keyword set driving the broad sources (네이버뉴스). DC is already
// group-specific. Korean + romanized terms maximize search breadth.
// Distinctive member names stand alone; common-word names (가을/레이/리즈/이서)
// are qualified with "아이브" to avoid unrelated results.
export const KEYWORDS = [
  "아이브",
  "IVE",
  "안유진",
  "장원영",
  "아이브 가을",
  "아이브 레이",
  "아이브 리즈",
  "아이브 이서",
];

// Sources wired AND enabled. 스레드/더쿠/인스티즈 are deferred.
export const ENABLED_SOURCES: FeedSource[] = ["naver", "daum", "dc", "instagram", "pann"];

// Global cap is a payload backstop; the real fairness knob is the per-source
// cap below (news volume must not push old Instagram posts out of the feed).
export const FEED_LIMIT = 400;
export const FEED_PER_SOURCE_LIMIT = 100;
export const NAVER_PER_KEYWORD = 30;
// Nate Pann results per keyword (comment-sorted). Kept low — robots.txt is
// Disallow:/, so we read as little as gives a useful signal.
export const PANN_PER_KEYWORD = 15;
// Daum web search (Kakao Search API) results per keyword.
export const DAUM_PER_KEYWORD = 25;
// Per-account cap — 7 accounts, so keep each slice small and polite.
export const IG_MEDIA_LIMIT = 12;
// IVE official + member accounts (all verified), read via the logged-out
// web_profile_info API. Instagram rate-limits bursts, so each feed refresh
// fetches ONE account (round-robin) and accumulates results in KV — see
// sources/instagram.ts.
export const IG_USERNAMES = [
  "ivestarship", // 공식
  "_yujin_an", // 안유진
  "fallingin__fall", // 가을
  "reinyourheart", // 레이
  "for_everyoung10", // 장원영
  "liz.yeyo", // 리즈
  "eeseooes", // 이서
];
// KV key prefix for the Instagram rotation state (reuses SHORTS_CACHE).
// `<prefix>:cursor` + one `<prefix>:u:<username>` key per account — per-key
// storage survives KV eventual consistency; a single blob does not.
export const IG_STATE_KV_KEY = "feed:ig:v2";

// DC 1,2,3 아이브 마이너 갤러리 (verified: gall.dcinside.com/mgallery/board/lists/?id=123ive).
// "mgallery" = minor gallery (board path /mgallery/board/...),
// "board" = regular gallery (/board/...).
export const DC_GALLERY_ID = "123ive";
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
  pann: "네이트판",
  threads: "스레드",
  theqoo: "더쿠",
  instiz: "인스티즈",
};
