"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { ChannelInfo, ClipKind, VideoSummary } from "@/lib/types";
import { useLiveStream, type StreamSpeed } from "@/lib/useLiveStream";
import { useComments } from "@/lib/useComments";
import { LiveChat } from "@/components/LiveChat";
import { CommentList } from "@/components/CommentList";
import { VideoPicker, formatCount } from "@/components/VideoPicker";
import { HallOfFame } from "@/components/HallOfFame";
import { SearchView } from "@/components/SearchView";
import { SyncView } from "@/components/SyncView";
import { preloadFirstPages } from "@/lib/commentsCache";

// Quick-pick channels shown in the header. The API resolves both @handles and
// raw channel ids (UC…), so the official channel is keyed by its id.
const PRESET_CHANNELS = [
  { label: "원이", handle: "@helloiamwoninicetomeetyou" },
  { label: "리센느 공식", handle: "UCtKtCiaWRz-d3EZn2xd1mdA" },
] as const;
const DEFAULT_HANDLE = PRESET_CHANNELS[0].handle;
const SPEEDS: StreamSpeed[] = ["slow", "normal", "fast"];

type ViewMode = "list" | "live" | "sync" | "hall" | "search";

// Channel-wide views (not tied to the selected video).
const CHANNEL_VIEWS: ViewMode[] = ["hall", "search"];

/** Toss-style pill segmented control. */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]";
  return (
    <div className="flex items-center gap-1 rounded-full bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full font-semibold transition-colors ${pad} ${
            value === o.value
              ? "bg-accent text-white shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Home() {
  const [handleInput, setHandleInput] = useState<string>(DEFAULT_HANDLE);
  const [activeHandle, setActiveHandle] = useState<string>(DEFAULT_HANDLE);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipKind, setClipKind] = useState<ClipKind>("video");
  const [order, setOrder] = useState<"relevance" | "time">("relevance");
  const [mode, setMode] = useState<ViewMode>("list");
  const [loop, setLoop] = useState(true);
  const [railOpen, setRailOpen] = useState(false); // mobile video drawer
  const [railCollapsed, setRailCollapsed] = useState(false); // desktop rail
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);

  const filtered = useMemo(
    () => videos.filter((v) => v.kind === clipKind),
    [videos, clipKind],
  );
  const counts = useMemo(
    () => ({
      video: videos.filter((v) => v.kind === "video").length,
      short: videos.filter((v) => v.kind === "short").length,
    }),
    [videos],
  );

  // Keep selection valid for the active 영상/쇼츠 filter.
  useEffect(() => {
    if (videos.length === 0) return;
    if (!filtered.some((v) => v.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, videos, selectedId]);

  const live = useLiveStream({
    videoId: mode === "live" ? selectedId : null,
    order,
    loop,
    maxVisible: 60,
  });
  const list = useComments({
    videoId: mode === "list" || mode === "sync" ? selectedId : null,
    order,
  });

  const loadChannel = useCallback(async (handle: string) => {
    setActiveHandle(handle);
    setChannelLoading(true);
    setChannelError(null);
    try {
      const res = await fetch(
        `/api/channel?handle=${encodeURIComponent(handle)}`,
      );
      const data = (await res.json()) as {
        channel?: ChannelInfo;
        videos?: VideoSummary[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load channel.");
      setChannel(data.channel ?? null);
      setVideos(data.videos ?? []);
      setSelectedId(null);
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Failed to load.");
      setChannel(null);
      setVideos([]);
      setSelectedId(null);
    } finally {
      setChannelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannel(DEFAULT_HANDLE);
  }, [loadChannel]);

  // After load, preload every video's first comment page in the background so
  // any click renders instantly. Cancels/restarts when the channel or sort
  // order changes. Starts shortly after so the selected video loads first.
  useEffect(() => {
    if (videos.length === 0) return;
    const ids = videos.map((v) => v.id);
    let cancel = () => {};
    const timer = setTimeout(() => {
      cancel = preloadFirstPages(ids, order, 5);
    }, 600);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [videos, order]);

  const onSubmitHandle = (e: React.FormEvent) => {
    e.preventDefault();
    if (handleInput.trim()) void loadChannel(handleInput.trim());
  };

  const loadPreset = (handle: string) => {
    setHandleInput(handle);
    void loadChannel(handle);
  };

  const selectedVideo = videos.find((v) => v.id === selectedId) ?? null;
  const isChannelView = CHANNEL_VIEWS.includes(mode);

  // "인기순" should be true likes-descending (YouTube's relevance order mixes in
  // pins/replies/recency); "최신순" keeps YouTube's chronological order.
  const listComments = useMemo(
    () =>
      order === "relevance"
        ? [...list.comments].sort((a, b) => b.likeCount - a.likeCount)
        : list.comments,
    [list.comments, order],
  );

  // Pick a video from the rail; leave channel-wide views for the per-video view.
  const selectVideo = (id: string) => {
    setSelectedId(id);
    setMode((m) => (CHANNEL_VIEWS.includes(m) ? "list" : m));
  };

  // Step the rail selection by ±1 within the current 영상/쇼츠 filter.
  const moveSelection = (delta: number) => {
    if (filtered.length === 0) return;
    const idx = filtered.findIndex((v) => v.id === selectedId);
    const next =
      idx < 0 ? 0 : Math.min(filtered.length - 1, Math.max(0, idx + delta));
    const target = filtered[next];
    if (target && target.id !== selectedId) selectVideo(target.id);
  };

  // ↑/↓ moves to the prev/next video instead of scrolling the rail.
  const onRailKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveSelection(-1);
    }
  };

  // Jump to a video from hall/search (also align the 영상/쇼츠 filter to it).
  const jumpToVideo = (id: string) => {
    const v = videos.find((x) => x.id === id);
    if (v) setClipKind(v.kind);
    setSelectedId(id);
    setMode("list");
  };

  // Shared rail content (used by the desktop sidebar and the mobile drawer).
  const railBody = (onPick: (id: string) => void) => (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink">동영상</span>
          <div className="flex items-center gap-2">
            <span className="num text-[12px] text-faint">
              {filtered.length}개 · 출시순
            </span>
            <button
              onClick={() => setRailCollapsed(true)}
              title="목록 접기"
              className="hidden rounded-md p-1 text-faint hover:bg-[var(--surface-2)] hover:text-ink md:inline-flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
        </div>
        <Segmented<ClipKind>
          size="sm"
          value={clipKind}
          onChange={setClipKind}
          options={[
            { value: "video", label: `영상 ${counts.video}` },
            { value: "short", label: `쇼츠 ${counts.short}` },
          ]}
        />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto outline-none"
        tabIndex={0}
        onKeyDown={onRailKeyDown}
      >
        {filtered.length > 0 ? (
          <VideoPicker
            videos={filtered}
            selectedId={selectedId}
            order={order}
            onSelect={onPick}
          />
        ) : (
          <p className="px-4 py-10 text-center text-[13px] text-faint">
            {channelLoading ? "불러오는 중…" : "해당 항목이 없어요"}
          </p>
        )}
      </div>
    </>
  );

  return (
    <main className="flex h-dvh flex-col">
      {/* ───────────── Header ───────────── */}
      <header className="flex flex-nowrap items-center gap-x-3 border-b border-line bg-[var(--surface)] px-4 py-3 sm:gap-x-5 sm:px-6 sm:py-3.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="relative flex h-2 w-2 items-center justify-center">
            {mode === "live" && (
              <span className="live-ring absolute h-2 w-2 rounded-full bg-accent" />
            )}
            <span className="h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-[18px] font-extrabold tracking-tight text-ink sm:text-[19px]">
            RESCENE
          </span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
            {mode === "live" ? "LIVE" : "댓글"}
          </span>
        </div>

        {/* Channel quick-pick — hidden on mobile to keep the header one line. */}
        <div className="hidden shrink-0 items-center gap-1 border-l border-line pl-5 md:flex">
          {PRESET_CHANNELS.map((c) => {
            const active = c.handle === activeHandle;
            return (
              <button
                key={c.handle}
                onClick={() => loadPreset(c.handle)}
                disabled={channelLoading}
                className={`flex items-center gap-2 rounded-full py-1.5 pr-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                  active
                    ? "bg-accent-soft pl-1.5 text-accent"
                    : "pl-3.5 text-muted hover:bg-[var(--surface-2)] hover:text-ink"
                }`}
              >
                {active && channel?.thumbnail && (
                  <Image
                    src={channel.thumbnail}
                    alt=""
                    width={24}
                    height={24}
                    unoptimized
                    className="h-6 w-6 rounded-full"
                  />
                )}
                {c.label}
              </button>
            );
          })}
        </div>

        <form
          onSubmit={onSubmitHandle}
          className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none"
        >
          <input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="@채널 핸들"
            className="w-full min-w-0 rounded-full border border-line bg-[var(--surface-2)] px-4 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-white md:w-48"
          />
          <button
            type="submit"
            disabled={channelLoading}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-accent-ink disabled:opacity-50"
          >
            {channelLoading ? "..." : "불러오기"}
          </button>
        </form>
      </header>

      {channelError && (
        <div className="border-b border-line bg-accent-soft px-6 py-2.5 text-[13px] text-accent-ink">
          {channelError}
          {channelError.includes("YOUTUBE_API_KEY") && (
            <span className="ml-1 opacity-75">
              — <code>.env.local</code>에 키를 넣고 재시작하세요.
            </span>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ───────────── Video rail (desktop, collapsible) ───────────── */}
        {!railCollapsed && (
          <aside className="hidden w-96 shrink-0 flex-col border-r border-line bg-[var(--surface)] md:flex">
            {railBody(selectVideo)}
          </aside>
        )}

        {/* ───────────── Stage ───────────── */}
        <section className="relative flex min-w-0 flex-1 flex-col bg-[var(--surface)]">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-6">
            {/* Mobile: open the video drawer */}
            <button
              onClick={() => setRailOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[13px] font-semibold text-ink md:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              영상
            </button>

            {/* Desktop: reopen the collapsed rail */}
            {railCollapsed && (
              <button
                onClick={() => setRailCollapsed(false)}
                className="hidden items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[13px] font-semibold text-ink md:inline-flex"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                영상 목록
              </button>
            )}

            <Segmented<ViewMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "list", label: "목록" },
                { value: "live", label: "라이브" },
                { value: "sync", label: "동기화" },
                { value: "hall", label: "전당" },
                { value: "search", label: "검색" },
              ]}
            />

            {/* 전당은 항상 좋아요순 TOP이라 인기/최신 토글이 의미가 없다. */}
            {mode !== "hall" && (
              <Segmented<"relevance" | "time">
                size="sm"
                value={order}
                onChange={setOrder}
                options={[
                  { value: "relevance", label: "인기순" },
                  { value: "time", label: "최신순" },
                ]}
              />
            )}

            {mode === "live" && (
              <div className="flex items-center gap-2 border-l border-line pl-3">
                <button
                  onClick={live.togglePlay}
                  className="rounded-full bg-[var(--surface-2)] px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  {live.state.playing ? "❚❚ 일시정지" : "▶ 재생"}
                </button>
                <Segmented<StreamSpeed>
                  size="sm"
                  value={live.speed}
                  onChange={live.setSpeed}
                  options={SPEEDS.map((s) => ({ value: s, label: s }))}
                />
                <button
                  onClick={() => setLoop((l) => !l)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                    loop
                      ? "bg-accent-soft text-accent"
                      : "bg-[var(--surface-2)] text-faint hover:text-muted"
                  }`}
                >
                  ↻ 반복
                </button>
              </div>
            )}

            {!isChannelView && (
              <span className="num ml-auto text-[12px] text-faint">
                {mode === "live"
                  ? `${live.state.shown} / ${live.state.total}`
                  : `댓글 ${list.comments.length}개`}
              </span>
            )}
          </div>

          {/* Now playing */}
          {selectedVideo && !isChannelView && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 sm:px-6">
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                {selectedVideo.kind === "short" ? "쇼츠" : "영상"}
              </span>
              <span className="max-w-[40ch] truncate text-[14px] font-semibold text-ink">
                {selectedVideo.title}
              </span>
              <span className="num flex items-center gap-3 text-[12px] text-faint">
                <span>조회수 {formatCount(selectedVideo.viewCount)}</span>
                <span>좋아요 {formatCount(selectedVideo.likeCount)}</span>
                <span>댓글 {formatCount(selectedVideo.commentCount)}</span>
              </span>
            </div>
          )}

          {/* Surface */}
          <div className="relative min-h-0 flex-1">
            {mode === "hall" ? (
              <HallOfFame videos={videos} onJump={jumpToVideo} />
            ) : mode === "search" ? (
              <SearchView
                videos={videos}
                order={order}
                onJump={jumpToVideo}
                channelTitle={channel?.title ?? ""}
                channelHandle={channel?.handle ?? ""}
              />
            ) : !selectedId ? (
              <EmptyState message="영상을 선택하세요" />
            ) : mode === "sync" ? (
              <SyncView
                videoId={selectedId}
                comments={list.comments}
                hasMore={list.hasMore}
                loading={list.loading}
                onLoadMore={list.loadMore}
              />
            ) : mode === "live" ? (
              live.state.error ? (
                <EmptyState message={live.state.error} tone="error" />
              ) : live.state.visible.length === 0 ? (
                <EmptyState message="채팅 준비 중…" />
              ) : (
                <LiveChat messages={live.state.visible} videoId={selectedId} />
              )
            ) : list.error ? (
              <EmptyState message={list.error} tone="error" />
            ) : list.comments.length === 0 ? (
              <EmptyState
                message={list.loading ? "댓글 불러오는 중…" : "댓글이 없어요"}
              />
            ) : (
              <CommentList
                comments={listComments}
                loading={list.loading}
                hasMore={list.hasMore}
                onLoadMore={list.loadMore}
                videoId={selectedId}
              />
            )}
          </div>
        </section>
      </div>

      {/* ───────────── Video drawer (mobile) ───────────── */}
      {railOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setRailOpen(false)}
          />
          <div className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-[var(--surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold text-ink">영상 고르기</span>
              <button
                onClick={() => setRailOpen(false)}
                className="rounded-full p-1.5 text-faint hover:bg-[var(--surface-2)] hover:text-ink"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {railBody((id) => {
              selectVideo(id);
              setRailOpen(false);
            })}
          </div>
        </div>
      )}
    </main>
  );
}

function EmptyState({
  message,
  tone = "muted",
}: {
  message: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p
        className={`text-[14px] font-medium ${
          tone === "error" ? "text-accent-ink" : "text-faint"
        }`}
      >
        {message}
      </p>
    </div>
  );
}
