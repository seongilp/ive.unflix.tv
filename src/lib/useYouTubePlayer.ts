"use client";

// Minimal YouTube IFrame Player API wrapper: loads the API once, mounts a player
// into a wrapper div, tracks currentTime, and exposes seekTo.

import { useCallback, useEffect, useRef, useState } from "react";

interface YTPlayer {
  loadVideoById: (id: string) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  getCurrentTime: () => number;
  destroy: () => void;
}
interface YTGlobal {
  Player: new (
    el: HTMLElement,
    opts: Record<string, unknown>,
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export function useYouTubePlayer(videoId: string | null) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Create the player once and poll its time.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    void loadApi().then(() => {
      if (cancelled || !wrapperRef.current || !window.YT) return;
      const host = document.createElement("div");
      host.style.width = "100%";
      host.style.height = "100%";
      wrapperRef.current.appendChild(host);
      playerRef.current = new window.YT.Player(host, {
        width: "100%",
        height: "100%",
        videoId: videoId ?? undefined,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
        events: { onReady: () => !cancelled && setReady(true) },
      });
      timer = setInterval(() => {
        const p = playerRef.current;
        if (p?.getCurrentTime) setCurrentTime(p.getCurrentTime());
      }, 500);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      if (wrapperRef.current) wrapperRef.current.innerHTML = "";
      setReady(false);
    };
  }, []);

  // Swap the video when the selection changes.
  useEffect(() => {
    if (ready && videoId && playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      setCurrentTime(0);
    }
  }, [videoId, ready]);

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.playVideo();
  }, []);

  return { wrapperRef, ready, currentTime, seekTo };
}
