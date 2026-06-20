import type { FeedItem } from "../types";
import { stripHtml, truncate } from "../html";
import { KEYWORDS, DAUM_PER_KEYWORD } from "../config";

// Daum web search via the Kakao Search API.
const ENDPOINT = "https://dapi.kakao.com/v2/search/web";

interface DaumWebDoc {
  title: string;
  contents: string;
  url: string;
  datetime: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "daum";
  }
}

export function normalizeDaum(docs: DaumWebDoc[]): FeedItem[] {
  return docs.map((d) => ({
    id: `daum:${d.url}`,
    source: "daum" as const,
    author: hostOf(d.url),
    title: truncate(stripHtml(d.title), 120),
    snippet: truncate(stripHtml(d.contents), 200),
    url: d.url,
    publishedAt: Date.parse(d.datetime) || 0,
  }));
}

async function fetchOne(keyword: string, key: string): Promise<FeedItem[]> {
  const url =
    `${ENDPOINT}?query=${encodeURIComponent(keyword)}&size=${DAUM_PER_KEYWORD}`;
  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { documents?: DaumWebDoc[] };
  return normalizeDaum(data.documents ?? []);
}

// Disabled (returns []) without a key. Sequential per keyword — Kakao throttles
// concurrent requests from one app to an empty 200 (same behaviour as Naver).
export async function fetchItems(keywords: string[] = KEYWORDS): Promise<FeedItem[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return [];
  const items: FeedItem[] = [];
  for (const kw of keywords) {
    try {
      items.push(...(await fetchOne(kw, key)));
    } catch {
      // one keyword failing shouldn't drop the others
    }
  }
  return items;
}
