"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import type { VideoSummary } from "@/lib/types";
import { fetchFirstPage } from "@/lib/commentsCache";

function formatDuration(s: number): string {
  if (s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// YouTube-style Korean compact counts: 1.2천 / 3.4만 / 1.1억.
export function formatCount(n: number): string {
  if (n >= 1e8) return `${trim(n / 1e8)}억`;
  if (n >= 1e4) return `${trim(n / 1e4)}만`;
  if (n >= 1e3) return `${trim(n / 1e3)}천`;
  return n.toLocaleString();
}
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

// Warm the client comment cache on hover so the click is instant.
function prefetchComments(videoId: string, order: string) {
  void fetchFirstPage(videoId, order).catch(() => undefined);
}

export function VideoPicker({
  videos,
  selectedId,
  order,
  onSelect,
}: {
  videos: VideoSummary[];
  selectedId: string | null;
  order: "relevance" | "time";
  onSelect: (id: string) => void;
}) {
  // Keep the selected row visible (e.g. when ↑/↓ moves past the viewport edge).
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <ul className="flex flex-col gap-1 p-2">
      {videos.map((v, i) => {
        const active = v.id === selectedId;
        return (
          <li key={v.id}>
            <button
              ref={active ? activeRef : undefined}
              onClick={() => onSelect(v.id)}
              onMouseEnter={() => prefetchComments(v.id, order)}
              onFocus={() => prefetchComments(v.id, order)}
              className={`group flex w-full items-start gap-3 rounded-2xl p-2.5 text-left transition-colors ${
                active ? "bg-accent" : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span
                className={`num w-5 shrink-0 pt-0.5 text-center text-[13px] font-bold ${
                  active ? "text-white/90" : "text-faint"
                }`}
              >
                {i + 1}
              </span>
              <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-2)]">
                {v.thumbnail && (
                  <Image
                    src={v.thumbnail}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                )}
                {v.durationSeconds > 0 && (
                  <span className="num absolute bottom-1 right-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {formatDuration(v.durationSeconds)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[14px] font-semibold leading-snug ${
                    active ? "text-white" : "text-ink"
                  }`}
                >
                  {v.title}
                </span>
                <div
                  className={`num mt-1 flex items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] ${
                    active ? "text-white/85" : "text-faint"
                  }`}
                >
                  <span>조회 {formatCount(v.viewCount)}</span>
                  <span>♥ {formatCount(v.likeCount)}</span>
                  <span>댓글 {formatCount(v.commentCount)}</span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
