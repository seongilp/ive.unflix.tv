"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { ChannelInfo, ClipKind, VideoSummary } from "@/lib/types";
import { useLiveStream, type StreamSpeed } from "@/lib/useLiveStream";
import { useComments } from "@/lib/useComments";
import { LiveChat } from "@/components/LiveChat";
import { CommentList } from "@/components/CommentList";
import { VideoPicker, formatCount } from "@/components/VideoPicker";

const DEFAULT_HANDLE = "@helloiamwoninicetomeetyou";
const SPEEDS: StreamSpeed[] = ["slow", "normal", "fast"];

type ViewMode = "list" | "live";

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
  const [handleInput, setHandleInput] = useState(DEFAULT_HANDLE);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipKind, setClipKind] = useState<ClipKind>("video");
  const [order, setOrder] = useState<"relevance" | "time">("relevance");
  const [mode, setMode] = useState<ViewMode>("list");
  const [loop, setLoop] = useState(true);
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
    videoId: mode === "list" ? selectedId : null,
    order,
  });

  const loadChannel = useCallback(async (handle: string) => {
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

  const onSubmitHandle = (e: React.FormEvent) => {
    e.preventDefault();
    if (handleInput.trim()) void loadChannel(handleInput.trim());
  };

  const selectedVideo = videos.find((v) => v.id === selectedId) ?? null;

  return (
    <main className="flex h-dvh flex-col">
      {/* ───────────── Header ───────────── */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line bg-[var(--surface)] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2 items-center justify-center">
            {mode === "live" && (
              <span className="live-ring absolute h-2 w-2 rounded-full bg-accent" />
            )}
            <span className="h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-[19px] font-extrabold tracking-tight text-ink">
            RESCENE
          </span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
            {mode === "live" ? "LIVE" : "댓글"}
          </span>
        </div>

        {channel && (
          <div className="flex items-center gap-2.5 border-l border-line pl-5">
            {channel.thumbnail && (
              <Image
                src={channel.thumbnail}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-full"
              />
            )}
            <div className="leading-tight">
              <div className="max-w-[36ch] truncate text-[14px] font-semibold text-ink">
                {channel.title}
              </div>
              <div className="text-[12px] text-faint">{channel.handle}</div>
            </div>
          </div>
        )}

        <form
          onSubmit={onSubmitHandle}
          className="ml-auto flex items-center gap-2"
        >
          <input
            value={handleInput}
            onChange={(e) => setHandleInput(e.target.value)}
            placeholder="@채널 핸들"
            className="w-48 rounded-full border border-line bg-[var(--surface-2)] px-4 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-accent focus:bg-white"
          />
          <button
            type="submit"
            disabled={channelLoading}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-accent-ink disabled:opacity-50"
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
        {/* ───────────── Video rail ───────────── */}
        <aside className="hidden w-96 shrink-0 flex-col border-r border-line bg-[var(--surface)] md:flex">
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-ink">동영상</span>
              <span className="num text-[12px] text-faint">
                {filtered.length}개 · 출시순
              </span>
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length > 0 ? (
              <VideoPicker
                videos={filtered}
                selectedId={selectedId}
                order={order}
                onSelect={setSelectedId}
              />
            ) : (
              <p className="px-4 py-10 text-center text-[13px] text-faint">
                {channelLoading ? "불러오는 중…" : "해당 항목이 없어요"}
              </p>
            )}
          </div>
        </aside>

        {/* ───────────── Stage ───────────── */}
        <section className="relative flex min-w-0 flex-1 flex-col bg-[var(--surface)]">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-6 py-3">
            <Segmented<ViewMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "list", label: "목록" },
                { value: "live", label: "라이브" },
              ]}
            />

            <Segmented<"relevance" | "time">
              size="sm"
              value={order}
              onChange={setOrder}
              options={[
                { value: "relevance", label: "인기순" },
                { value: "time", label: "최신순" },
              ]}
            />

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

            <span className="num ml-auto text-[12px] text-faint">
              {mode === "live"
                ? `${live.state.shown} / ${live.state.total}`
                : `댓글 ${list.comments.length}개`}
            </span>
          </div>

          {/* Now playing */}
          {selectedVideo && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-6 py-2.5">
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
            {!selectedId ? (
              <EmptyState message="영상을 선택하세요" />
            ) : mode === "live" ? (
              live.state.error ? (
                <EmptyState message={live.state.error} tone="error" />
              ) : live.state.visible.length === 0 ? (
                <EmptyState message="채팅 준비 중…" />
              ) : (
                <LiveChat messages={live.state.visible} />
              )
            ) : list.error ? (
              <EmptyState message={list.error} tone="error" />
            ) : list.comments.length === 0 ? (
              <EmptyState
                message={list.loading ? "댓글 불러오는 중…" : "댓글이 없어요"}
              />
            ) : (
              <CommentList
                comments={list.comments}
                loading={list.loading}
                hasMore={list.hasMore}
                onLoadMore={list.loadMore}
              />
            )}
          </div>
        </section>
      </div>
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
