"use client";

// Drives a "live chat" simulation: pulls comment pages from the API and
// reveals them one at a time on a timer, fetching more pages as the buffer
// drains. Optionally loops forever once a video's comments run out.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentItem } from "./types";

// A revealed comment carries a monotonic uid so React keys stay unique even
// when looping replays the same source comment.
export type RevealedComment = CommentItem & { uid: number };

export type StreamSpeed = "slow" | "normal" | "fast";

const SPEED_MS: Record<StreamSpeed, number> = {
  slow: 2600,
  normal: 1400,
  fast: 650,
};

// Small jitter so messages don't feel metronomic.
function intervalFor(speed: StreamSpeed): number {
  const base = SPEED_MS[speed];
  return base * (0.7 + Math.random() * 0.6);
}

interface Options {
  videoId: string | null;
  order: "relevance" | "time";
  loop: boolean;
  maxVisible: number;
}

interface State {
  visible: RevealedComment[];
  playing: boolean;
  loading: boolean;
  error: string | null;
  total: number;
  shown: number;
}

export function useLiveStream({ videoId, order, loop, maxVisible }: Options) {
  const [visible, setVisible] = useState<RevealedComment[]>([]);
  const [playing, setPlaying] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<StreamSpeed>("normal");
  const [shown, setShown] = useState(0);
  const [total, setTotal] = useState(0);

  // Mutable buffer of comments not yet revealed.
  const bufferRef = useRef<CommentItem[]>([]);
  const cursorRef = useRef(0); // index into the full fetched pool (for looping)
  const poolRef = useRef<CommentItem[]>([]); // everything fetched, for loop replay
  const pageTokenRef = useRef<string | undefined>(undefined);
  const exhaustedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingRef = useRef(false);
  const uidRef = useRef(0);

  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const loopRef = useRef(loop);
  playingRef.current = playing;
  speedRef.current = speed;
  loopRef.current = loop;

  const fetchPage = useCallback(async () => {
    if (!videoId || fetchingRef.current || exhaustedRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    try {
      const url = new URL("/api/comments", window.location.origin);
      url.searchParams.set("videoId", videoId);
      url.searchParams.set("order", order);
      if (pageTokenRef.current) {
        url.searchParams.set("pageToken", pageTokenRef.current);
      }
      const res = await fetch(url);
      const data = (await res.json()) as {
        comments?: CommentItem[];
        nextPageToken?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load comments.");

      const incoming: CommentItem[] = data.comments ?? [];
      bufferRef.current.push(...incoming);
      poolRef.current.push(...incoming);
      setTotal(poolRef.current.length);
      pageTokenRef.current = data.nextPageToken;
      if (!data.nextPageToken) exhaustedRef.current = true;
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments.");
      exhaustedRef.current = true;
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [videoId, order]);

  // Reset everything when the target video or order changes.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    bufferRef.current = [];
    poolRef.current = [];
    cursorRef.current = 0;
    pageTokenRef.current = undefined;
    exhaustedRef.current = false;
    setVisible([]);
    setShown(0);
    setTotal(0);
    setError(null);
    if (videoId) void fetchPage();
  }, [videoId, order, fetchPage]);

  // The reveal loop.
  useEffect(() => {
    if (!videoId) return;

    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      if (!playingRef.current) {
        timerRef.current = setTimeout(tick, 200);
        return;
      }

      // Top up the buffer ahead of time.
      if (bufferRef.current.length < 15 && !exhaustedRef.current) {
        void fetchPage();
      }

      let next = bufferRef.current.shift();

      // Looping: when buffer empties and source is exhausted, replay the pool.
      if (!next && exhaustedRef.current && loopRef.current && poolRef.current.length) {
        if (cursorRef.current >= poolRef.current.length) cursorRef.current = 0;
        next = poolRef.current[cursorRef.current++];
      }

      if (next) {
        const item: RevealedComment = { ...next, uid: uidRef.current++ };
        setVisible((prev) => {
          const merged = [...prev, item];
          return merged.slice(-maxVisible);
        });
        setShown((n) => n + 1);
      }

      timerRef.current = setTimeout(tick, intervalFor(speedRef.current));
    };

    timerRef.current = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [videoId, maxVisible, fetchPage]);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  return {
    state: { visible, playing, loading, error, total, shown } as State,
    speed,
    setSpeed,
    togglePlay,
  };
}
