import { parse } from "node-html-parser";
import type { FeedItem } from "../types";
import { DC_GALLERY_ID, DC_GALLERY_TYPE, DC_LIST_COUNT } from "../config";

const ORIGIN = "https://gall.dcinside.com";

// DC list 'title' attr carries the full KST datetime ("2026-06-17 12:34:56").
function parseDcDate(s: string): number {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`);
  return 0;
}

export function normalizeDc(html: string, galleryId: string): FeedItem[] {
  const root = parse(html);
  const items: FeedItem[] = [];
  for (const row of root.querySelectorAll("tr.ub-content")) {
    const no = row.getAttribute("data-no");
    if (!no) continue; // notices/ads have no post number
    const link = row.querySelector("td.gall_tit a");
    if (!link) continue;
    const href = link.getAttribute("href") ?? "";
    const url = href.startsWith("http") ? href : `${ORIGIN}${href}`;
    const dateEl = row.querySelector("td.gall_date");
    const dateStr = (dateEl?.getAttribute("title") ?? "").trim();
    items.push({
      id: `dc:${galleryId}:${no}`,
      source: "dc" as const,
      author:
        row.querySelector("td.gall_writer")?.getAttribute("data-nick")?.trim() ||
        "익명",
      title: link.text.trim(),
      snippet: "",
      url,
      publishedAt: parseDcDate(dateStr),
    });
  }
  return items;
}

// Scrapes the gallery list page. Best-effort: returns [] on any block/error
// (DC may reject Cloudflare edge IPs).
export async function fetchItems(): Promise<FeedItem[]> {
  const base = DC_GALLERY_TYPE === "mgallery" ? "/mgallery/board/lists/" : "/board/lists/";
  const url = `${ORIGIN}${base}?id=${DC_GALLERY_ID}&list_num=${DC_LIST_COUNT}&sort_type=N`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: `${ORIGIN}/`,
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    if (!res.ok) return [];
    return normalizeDc(await res.text(), DC_GALLERY_ID);
  } catch {
    return [];
  }
}
