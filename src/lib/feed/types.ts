// Normalized feed item — every source maps its native payload onto this shape
// so the UI never branches per platform.
export type FeedSource =
  | "naver"
  | "dc"
  | "instagram"
  | "threads"
  | "theqoo"
  | "instiz";

export interface FeedItem {
  id: string; // stable dedupe key: `${source}:${nativeId | url}`
  source: FeedSource;
  author: string;
  title: string;
  snippet: string;
  url: string;
  thumbnail?: string;
  publishedAt: number; // epoch ms — the merge sort key
}
