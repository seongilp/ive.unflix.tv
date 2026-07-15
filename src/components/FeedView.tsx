"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedItem, FeedSource } from "@/lib/feed/types";
import { ENABLED_SOURCES, SOURCE_LABELS } from "@/lib/feed/config";
import { MEMBERS } from "@/lib/analysis/members";

type Filter = "all" | FeedSource;

// Instagram sub-filter: 공식 + each member, keyed by account username.
const IG_ACCOUNTS: { username: string; label: string }[] = [
  { username: "ivestarship", label: "공식" },
  ...MEMBERS.map((m) => ({ username: m.igUsername, label: m.name })),
];

function igLabel(author: string): string | undefined {
  return IG_ACCOUNTS.find((a) => a.username === author)?.label;
}

// Instagram's CDN blocks cross-origin <img> loads (Cross-Origin-Resource-Policy:
// same-origin) AND 403s datacenter IPs (so our own Worker can't proxy it).
// images.weserv.nl fetches from non-blocked IPs and re-serves with permissive
// CORS/CORP — and resizes to a thumbnail while it's at it.
function proxiedThumb(url: string): string {
  return /cdninstagram\.com|fbcdn\.net/.test(url)
    ? `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=160&h=160&fit=cover`
    : url;
}

// "3분 전" / "2시간 전" / "6월 17일" style relative time.
function relativeTime(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function FeedView() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  // Member filter inside the 인스타 tab ("all" or an account username).
  const [igAuthor, setIgAuthor] = useState<string>("all");

  const pickFilter = (f: Filter) => {
    setFilter(f);
    setIgAuthor("all");
  };

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await fetch("/api/feed");
        const d = (await r.json()) as { items?: FeedItem[]; error?: string };
        if (!alive) return;
        if (d.error) setError(d.error);
        else setItems(d.items ?? []);
      } catch {
        if (alive) setError("피드를 불러오지 못했어요");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const bySource =
      filter === "all" ? items : items.filter((i) => i.source === filter);
    if (filter !== "instagram" || igAuthor === "all") return bySource;
    return bySource.filter((i) => i.author === igAuthor);
  }, [items, filter, igAuthor]);

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: "전체" },
    ...ENABLED_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Source filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3 sm:px-6">
        {chips.map((c) => (
          <button
            key={c.value}
            onClick={() => pickFilter(c.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              filter === c.value
                ? "bg-accent text-white"
                : "bg-[var(--surface-2)] text-muted hover:text-ink"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 인스타 멤버 하위 필터 */}
      {filter === "instagram" && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5 sm:px-6">
          {[{ username: "all", label: "전체" }, ...IG_ACCOUNTS].map((a) => {
            const count =
              a.username === "all"
                ? items.filter((i) => i.source === "instagram").length
                : items.filter(
                    (i) => i.source === "instagram" && i.author === a.username,
                  ).length;
            return (
              <button
                key={a.username}
                onClick={() => setIgAuthor(a.username)}
                disabled={count === 0 && a.username !== "all"}
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
                  igAuthor === a.username
                    ? "bg-accent-soft text-accent"
                    : "bg-[var(--surface-2)] text-muted hover:text-ink"
                }`}
              >
                {a.label} <span className="num text-faint">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Cards */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="px-4 py-10 text-center text-[13px] text-faint">불러오는 중…</p>
        ) : error ? (
          <p className="px-4 py-10 text-center text-[13px] text-accent-ink">{error}</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-faint">
            올라온 글이 없어요
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface-2)] sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                        {SOURCE_LABELS[item.source]}
                        {item.source === "instagram" && igLabel(item.author)
                          ? ` · ${igLabel(item.author)}`
                          : ""}
                      </span>
                      <span className="num text-[12px] text-faint">
                        {item.author}
                      </span>
                      <span className="num ml-auto text-[12px] text-faint">
                        {relativeTime(item.publishedAt)}
                      </span>
                    </div>
                    <p className="truncate text-[14px] font-semibold text-ink">
                      {item.title}
                    </p>
                    {item.snippet && (
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">
                        {item.snippet}
                      </p>
                    )}
                  </div>
                  {item.thumbnail && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={proxiedThumb(item.thumbnail)}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
