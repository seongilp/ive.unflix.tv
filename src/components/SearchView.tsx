"use client";

import { useMemo, useState } from "react";
import type { VideoSummary } from "@/lib/types";
import { useAllComments } from "@/lib/useAllComments";
import { ChannelCommentRow } from "./ChannelCommentRow";

const LIMIT = 200;

// Search across every preloaded comment in the channel, with filters.
export function SearchView({
  videos,
  order,
  onJump,
  channelTitle,
  channelHandle,
}: {
  videos: VideoSummary[];
  order: "relevance" | "time";
  onJump: (videoId: string) => void;
  channelTitle: string;
  channelHandle: string;
}) {
  const [query, setQuery] = useState("");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const all = useAllComments(order);
  const videoMap = useMemo(
    () => new Map(videos.map((v) => [v.id, v])),
    [videos],
  );

  const isOwner = (author: string) =>
    author === channelTitle ||
    author.toLowerCase() === channelHandle.toLowerCase();

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q && !ownerOnly) return [];
    return all
      .filter((c) => (!ownerOnly || isOwner(c.author)))
      .filter((c) => !q || c.text.toLowerCase().includes(q))
      .sort((a, b) => b.likeCount - a.likeCount)
      .slice(0, LIMIT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, q, ownerOnly]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2.5 border-b border-line px-5 py-3 sm:px-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="댓글 검색 (예: 원영, 유진, 직캠…)"
          className="w-full rounded-full border border-line bg-[var(--surface-2)] px-4 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-white"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOwnerOnly((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              ownerOnly
                ? "bg-accent text-white"
                : "bg-[var(--surface-2)] text-muted hover:text-ink"
            }`}
          >
            {channelTitle ? `${channelTitle} 본인 댓글만` : "채널 본인 댓글만"}
          </button>
          <span className="num ml-auto text-[12px] text-faint">
            {q || ownerOnly ? `${results.length}개` : `${all.length}개 중 검색`}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!q && !ownerOnly ? (
          <p className="px-6 py-16 text-center text-[14px] text-faint">
            검색어를 입력하거나 필터를 켜보세요.
          </p>
        ) : results.length === 0 ? (
          <p className="px-6 py-16 text-center text-[14px] text-faint">
            결과가 없어요.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {results.map((c) => (
              <ChannelCommentRow
                key={c.id + c.videoId}
                comment={c}
                video={videoMap.get(c.videoId)}
                onJump={onJump}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
