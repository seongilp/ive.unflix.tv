"use client";

import Image from "next/image";
import type { VideoSummary } from "@/lib/types";
import type { FlatComment } from "@/lib/useAllComments";
import { formatCount } from "./VideoPicker";
import { CommentText } from "./CommentText";

// A comment shown outside the context of a single video (hall of fame / search):
// includes a chip identifying which video it's from, which jumps to that video.
export function ChannelCommentRow({
  comment,
  video,
  rank,
  onJump,
}: {
  comment: FlatComment;
  video?: VideoSummary;
  rank?: number;
  onJump: (videoId: string) => void;
}) {
  return (
    <li className="flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-[var(--surface-2)] sm:px-6">
      {rank !== undefined && (
        <span
          className={`num w-6 shrink-0 pt-1 text-center text-sm font-bold ${
            rank <= 3 ? "text-accent" : "text-faint"
          }`}
        >
          {rank}
        </span>
      )}
      <Image
        src={comment.authorThumbnail}
        alt=""
        width={36}
        height={36}
        unoptimized
        className="mt-0.5 h-9 w-9 shrink-0 rounded-full"
      />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-muted">
            {comment.author}
          </span>
          {comment.likeCount > 0 && (
            <span className="num shrink-0 text-[12px] text-faint">
              ♥ {formatCount(comment.likeCount)}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
          <CommentText text={comment.text} videoId={comment.videoId} />
        </p>

        {/* Which video — click to open its comments */}
        <button
          onClick={() => onJump(comment.videoId)}
          className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--surface-2)] py-1 pl-1 pr-3 text-left transition-colors hover:bg-accent-soft"
        >
          <span className="relative h-7 w-12 shrink-0 overflow-hidden rounded-lg bg-black/10">
            {video?.thumbnail && (
              <Image
                src={video.thumbnail}
                alt=""
                fill
                unoptimized
                className="object-cover"
              />
            )}
          </span>
          <span className="line-clamp-1 text-[12px] font-medium text-muted">
            {video?.title ?? "영상"}
          </span>
        </button>
      </div>
    </li>
  );
}
