import { parse } from "node-html-parser";
import type { FeedItem } from "../types";
import { stripHtml, truncate } from "../html";
import { KEYWORDS, PANN_PER_KEYWORD } from "../config";

const ORIGIN = "https://pann.nate.com";

// Nate Pann search dates look like "26.07.15 18:31" (KST, 2-digit year).
function parsePannDate(s: string): number {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return Date.parse(`20${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`) || 0;
}

export function normalizePann(html: string): FeedItem[] {
  const root = parse(html);
  const items: FeedItem[] = [];
  for (const li of root.querySelectorAll("ul.s_list > li")) {
    const link = li.querySelector("div.tit a.subject");
    if (!link) continue;
    const href = link.getAttribute("href") ?? "";
    const idMatch = href.match(/\/talk\/(\d+)/);
    if (!idMatch) continue; // skip non-post rows
    const title = stripHtml(link.innerHTML);
    const preview = stripHtml(li.querySelector("div.txt a")?.innerHTML ?? "");
    const dateStr = (li.querySelector("div.info span.date")?.text ?? "").trim();
    // Author nickname is intentionally NOT stored — 조심 수집 원칙. The board
    // category (엔터톡 등) is a safe, non-identifying label instead.
    const board = (li.querySelector("div.info span.part a")?.text ?? "네이트판").trim();
    items.push({
      id: `pann:${idMatch[1]}`,
      source: "pann" as const,
      author: board,
      title: truncate(title, 120),
      snippet: truncate(preview, 200),
      url: `${ORIGIN}${href}`,
      publishedAt: parsePannDate(dateStr),
    });
  }
  return items;
}

// Searches Nate Pann per keyword, comment-sorted (sort=CD) so the most-
// discussed posts surface first — the useful signal for risk. Best-effort:
// returns [] on any block/error, never aborting the rest of the feed.
//
// NOTE: pann.nate.com/robots.txt is `Disallow: /`. This runs at low volume
// (a few requests every 5 min behind the feed cache), reads only public
// listing pages, and stores no author identity — but it is a deliberate,
// user-approved exception to that directive.
export async function fetchItems(keywords: string[] = KEYWORDS): Promise<FeedItem[]> {
  const byId = new Map<string, FeedItem>();
  for (const kw of keywords) {
    try {
      const url =
        `${ORIGIN}/search/talk?q=${encodeURIComponent(kw)}&sort=CD`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: `${ORIGIN}/`,
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      });
      if (!res.ok) continue;
      for (const it of normalizePann(await res.text()).slice(0, PANN_PER_KEYWORD)) {
        if (!byId.has(it.id)) byId.set(it.id, it);
      }
    } catch {
      // one keyword failing shouldn't drop the others
    }
  }
  return [...byId.values()];
}
