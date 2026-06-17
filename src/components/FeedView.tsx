"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeedItem, FeedSource } from "@/lib/feed/types";
import { ENABLED_SOURCES, SOURCE_LABELS } from "@/lib/feed/config";

type Filter = "all" | FeedSource;

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

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.source === filter)),
    [items, filter],
  );

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
            onClick={() => setFilter(c.value)}
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
                      src={item.thumbnail}
                      alt=""
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
