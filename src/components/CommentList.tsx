"use client";

import Image from "next/image";
import type { CommentItem } from "@/lib/types";

function CommentRow({
  comment,
  rank,
}: {
  comment: CommentItem;
  rank: number;
}) {
  const isTop = rank <= 3;
  return (
    <li className="flex items-start gap-3.5 px-6 py-5 transition-colors hover:bg-[var(--surface-2)]">
      {/* Rank */}
      <span
        className={`num w-6 shrink-0 pt-1.5 text-center text-sm font-bold ${
          isTop ? "text-accent" : "text-faint"
        }`}
      >
        {rank}
      </span>

      {/* Avatar */}
      <Image
        src={comment.authorThumbnail}
        alt=""
        width={40}
        height={40}
        unoptimized
        className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
      />

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[14px] font-semibold text-muted">
            {comment.author}
          </span>
          {isTop && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
              인기
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink">
          {comment.text}
        </p>
      </div>

      {/* Likes */}
      {comment.likeCount > 0 && (
        <span className="num mt-1 flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-faint">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-like" fill="currentColor">
            <path d="M12 21s-7.5-4.8-10-9.3C.6 8.5 2 5 5.2 5 7 5 8.4 6 12 9.2 15.6 6 17 5 18.8 5 22 5 23.4 8.5 22 11.7 19.5 16.2 12 21 12 21z" />
          </svg>
          {comment.likeCount.toLocaleString()}
        </span>
      )}
    </li>
  );
}

export function CommentList({
  comments,
  loading,
  hasMore,
  onLoadMore,
}: {
  comments: CommentItem[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <ul className="divide-y divide-[var(--color-line)]">
        {comments.map((c, i) => (
          <CommentRow key={c.id} comment={c} rank={i + 1} />
        ))}
      </ul>

      <div className="flex justify-center p-8">
        {hasMore ? (
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="rounded-2xl bg-[var(--surface-2)] px-6 py-3 text-[15px] font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50"
          >
            {loading ? "불러오는 중…" : "댓글 더 보기"}
          </button>
        ) : (
          comments.length > 0 && (
            <span className="text-[13px] text-faint">마지막 댓글이에요</span>
          )
        )}
      </div>
    </div>
  );
}
