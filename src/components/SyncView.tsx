"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import type { CommentItem } from "@/lib/types";
import { firstTimestampSeconds } from "@/lib/timestamps";
import { useYouTubePlayer } from "@/lib/useYouTubePlayer";

// Keep pulling comment pages until the timeline is rich enough (or we hit caps).
const ENOUGH_TIMELINE = 40;
const MAX_AUTO_PAGES = 8;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

interface Stamped {
  comment: CommentItem;
  seconds: number;
}

export function SyncView({
  videoId,
  comments,
  hasMore,
  loading,
  onLoadMore,
}: {
  videoId: string | null;
  comments: CommentItem[];
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  const { wrapperRef, currentTime, seekTo } = useYouTubePlayer(videoId);

  // Auto-pull more pages until the timeline is rich enough.
  const autoPagesRef = useRef(0);
  useEffect(() => {
    autoPagesRef.current = 0;
  }, [videoId]);

  // Comments that reference a timestamp, ordered along the video timeline.
  const stamped = useMemo<Stamped[]>(() => {
    const out: Stamped[] = [];
    for (const c of comments) {
      const s = firstTimestampSeconds(c.text);
      if (s !== null) out.push({ comment: c, seconds: s });
    }
    return out.sort((a, b) => a.seconds - b.seconds);
  }, [comments]);

  // Load additional pages while the timeline is still thin.
  useEffect(() => {
    if (loading || !hasMore) return;
    if (stamped.length >= ENOUGH_TIMELINE) return;
    if (autoPagesRef.current >= MAX_AUTO_PAGES) return;
    autoPagesRef.current++;
    onLoadMore();
  }, [loading, hasMore, stamped.length, onLoadMore]);

  const gathering =
    loading && stamped.length < ENOUGH_TIMELINE && hasMore;

  // Active = last comment whose timestamp has been reached.
  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < stamped.length; i++) {
      if (stamped[i].seconds <= currentTime + 0.5) idx = i;
      else break;
    }
    return idx;
  }, [stamped, currentTime]);

  // Keep the active comment in view as playback advances.
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  return (
    <div className="flex h-full flex-col">
      {/* Player */}
      <div className="aspect-video w-full shrink-0 bg-black">
        <div ref={wrapperRef} className="h-full w-full" />
      </div>

      {/* Timestamped comments */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-line px-5 py-2.5 sm:px-6">
          <span className="text-[13px] font-bold text-ink">타임라인 댓글</span>
          <span className="num text-[12px] text-faint">
            {stamped.length}개{gathering ? " · 더 모으는 중…" : ""}
          </span>
        </div>

        {stamped.length === 0 ? (
          <p className="px-6 py-16 text-center text-[14px] text-faint">
            이 영상엔 타임스탬프가 달린 댓글이 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {stamped.map((s, i) => {
              const active = i === activeIndex;
              return (
                <li
                  key={s.comment.id}
                  ref={active ? activeRef : undefined}
                  onClick={() => seekTo(s.seconds)}
                  className={`flex cursor-pointer items-start gap-3 px-5 py-3 transition-colors sm:px-6 ${
                    active ? "bg-accent-soft" : "hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <span
                    className={`num mt-0.5 shrink-0 rounded-md px-2 py-1 text-[12px] font-bold ${
                      active
                        ? "bg-accent text-white"
                        : "bg-[var(--surface-2)] text-accent"
                    }`}
                  >
                    {fmt(s.seconds)}
                  </span>
                  <Image
                    src={s.comment.authorThumbnail}
                    alt=""
                    width={28}
                    height={28}
                    unoptimized
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-[12px] font-semibold text-muted">
                      {s.comment.author}
                    </span>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
                      {s.comment.text}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
