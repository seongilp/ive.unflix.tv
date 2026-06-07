"use client";

import { useMemo } from "react";
import type { VideoSummary } from "@/lib/types";
import { useAllComments } from "@/lib/useAllComments";
import { ChannelCommentRow } from "./ChannelCommentRow";

const TOP_N = 100;

// Channel-wide best comments: every preloaded comment ranked by likes.
export function HallOfFame({
  videos,
  onJump,
}: {
  videos: VideoSummary[];
  onJump: (videoId: string) => void;
}) {
  // 전당은 좋아요순 TOP이라 항상 인기순 첫 페이지에서 수집한다.
  const all = useAllComments("relevance");
  const videoMap = useMemo(
    () => new Map(videos.map((v) => [v.id, v])),
    [videos],
  );

  const top = useMemo(
    () =>
      [...all].sort((a, b) => b.likeCount - a.likeCount).slice(0, TOP_N),
    [all],
  );

  const loadedVideos = useMemo(
    () => new Set(all.map((c) => c.videoId)).size,
    [all],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-5 py-3 sm:px-6">
        <span className="text-[15px] font-bold text-ink">명댓글 전당 🏆</span>
        <span className="num text-[12px] text-faint">
          좋아요순 TOP {Math.min(TOP_N, top.length)} · {loadedVideos}/
          {videos.length} 영상에서 수집
          {loadedVideos < videos.length ? " (모으는 중…)" : ""}
        </span>
      </div>

      {top.length === 0 ? (
        <p className="px-6 py-16 text-center text-[14px] text-faint">
          댓글 모으는 중이에요…
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {top.map((c, i) => (
            <ChannelCommentRow
              key={c.id}
              comment={c}
              video={videoMap.get(c.videoId)}
              rank={i + 1}
              onJump={onJump}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
