import type { FeedItem } from "../types";
import { stripHtml, truncate } from "../html";
import { KEYWORDS, NAVER_PER_KEYWORD } from "../config";

interface NaverNewsItem {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "news";
  }
}

export function normalizeNaver(items: NaverNewsItem[]): FeedItem[] {
  return items.map((it) => {
    const url = it.originallink || it.link;
    return {
      id: `naver:${url}`,
      source: "naver" as const,
      author: hostOf(url),
      title: truncate(stripHtml(it.title), 120),
      snippet: truncate(stripHtml(it.description), 200),
      url,
      publishedAt: Date.parse(it.pubDate) || 0,
    };
  });
}

async function fetchOne(
  keyword: string,
  clientId: string,
  clientSecret: string,
): Promise<FeedItem[]> {
  const url =
    `https://openapi.naver.com/v1/search/news.json` +
    `?query=${encodeURIComponent(keyword)}&display=${NAVER_PER_KEYWORD}&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { items?: NaverNewsItem[] };
  return normalizeNaver(data.items ?? []);
}

// Disabled (returns []) when creds are missing. One request per keyword, merged.
export async function fetchItems(keywords: string[] = KEYWORDS): Promise<FeedItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const results = await Promise.allSettled(
      keywords.map((kw) => fetchOne(kw, clientId, clientSecret)),
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  } catch {
    return [];
  }
}
