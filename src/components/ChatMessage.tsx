"use client";

import Image from "next/image";
import type { CommentItem } from "@/lib/types";
import { CommentText } from "./CommentText";

export function ChatMessage({
  comment,
  videoId,
}: {
  comment: CommentItem;
  videoId: string | null;
}) {
  return (
    <div className="chat-row flex items-start gap-2.5 px-5 py-2 text-[15px] leading-snug">
      <Image
        src={comment.authorThumbnail}
        alt=""
        width={24}
        height={24}
        unoptimized
        className="mt-0.5 h-6 w-6 shrink-0 rounded-full"
      />
      <p className="min-w-0 break-words">
        <span className="mr-1.5 font-semibold text-muted">
          {comment.author}
        </span>
        <span className="text-ink">
          <CommentText text={comment.text} videoId={videoId} />
        </span>
        {comment.likeCount > 0 && (
          <span className="num ml-1.5 align-middle text-xs text-faint">
            ♥ {comment.likeCount}
          </span>
        )}
      </p>
    </div>
  );
}
