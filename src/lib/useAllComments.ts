"use client";

// Flattens every preloaded first-page comment (across all videos) into one list,
// tagged with its videoId, and re-renders as the background preload fills in.

import { useEffect, useState } from "react";
import { getAllFirstPages, subscribe } from "./commentsCache";
import type { CommentItem } from "./types";

export interface FlatComment extends CommentItem {
  videoId: string;
}

export function useAllComments(order: "relevance" | "time"): FlatComment[] {
  const [items, setItems] = useState<FlatComment[]>([]);

  useEffect(() => {
    const rebuild = () => {
      const flat: FlatComment[] = [];
      for (const { videoId, comments } of getAllFirstPages(order)) {
        for (const c of comments) flat.push({ ...c, videoId });
      }
      setItems(flat);
    };
    rebuild();
    return subscribe(rebuild);
  }, [order]);

  return items;
}
