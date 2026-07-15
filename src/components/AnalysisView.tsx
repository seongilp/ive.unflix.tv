"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { VideoSummary } from "@/lib/types";
import type { FeedItem } from "@/lib/feed/types";
import { useAllComments } from "@/lib/useAllComments";
import { analyzeComments, type SentimentCounts } from "@/lib/analysis/analyze";
import { memberKeyForIgUsername } from "@/lib/analysis/members";
import type { Keyword } from "@/lib/analysis/keywords";
import { stripHtml, truncate } from "@/lib/feed/html";

// Sentiment poles: teal/red validated for CVD separation; the midpoint is a
// deliberate neutral gray. Fixed order 긍정→중립→부정, never re-sorted.
const SENTIMENT = [
  { key: "positive", label: "긍정", color: "#0d9488" },
  { key: "neutral", label: "중립", color: "#b0b8c1" },
  { key: "negative", label: "부정", color: "#f04452" },
] as const;

// Everything analyzable is normalized to one unit shape, tagged by origin.
interface AnalysisUnit {
  id: string;
  text: string;
  likeCount: number;
  origin: "youtube" | "news" | "dc" | "instagram";
  author: string;
  videoId?: string; // youtube comments — jump to video
  url?: string; // feed items — open the original post/article
  members?: string[]; // pre-attributed member keys (member's own IG post)
}

const ORIGIN_LABELS: Record<AnalysisUnit["origin"], string> = {
  youtube: "유튜브",
  news: "뉴스",
  dc: "DC",
  instagram: "인스타",
};
const ORIGIN_ORDER: AnalysisUnit["origin"][] = ["youtube", "news", "dc", "instagram"];

type SourceFilter = "all" | AnalysisUnit["origin"];

function feedOrigin(source: FeedItem["source"]): AnalysisUnit["origin"] {
  if (source === "naver" || source === "daum") return "news";
  if (source === "instagram") return "instagram";
  return "dc";
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function countsTotal(c: SentimentCounts): number {
  return c.positive + c.neutral + c.negative;
}

// Thin stacked meter: 2px surface gaps between segments, rounded data ends.
function SentimentBar({
  counts,
  className = "h-2",
}: {
  counts: SentimentCounts;
  className?: string;
}) {
  const total = countsTotal(counts);
  if (total === 0) {
    return <div className={`${className} w-full rounded-full bg-[var(--surface-2)]`} />;
  }
  return (
    <div className={`flex ${className} w-full gap-[2px]`}>
      {SENTIMENT.map(({ key, color }) => {
        const value = counts[key];
        if (value === 0) return null;
        return (
          <div
            key={key}
            className="h-full min-w-[4px] rounded-full"
            style={{ width: `${(value / total) * 100}%`, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

// Color identity never rides on the fill alone — every bar gets these labels.
function SentimentLabels({ counts }: { counts: SentimentCounts }) {
  const total = countsTotal(counts);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {SENTIMENT.map(({ key, label, color }) => (
        <span key={key} className="flex items-center gap-1.5 text-[12px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          {label}{" "}
          <span className="num font-semibold text-ink">{pct(counts[key], total)}%</span>
        </span>
      ))}
    </div>
  );
}

function KeywordChips({ keywords }: { keywords: Keyword[] }) {
  if (keywords.length === 0) {
    return <p className="text-[12px] text-faint">키워드가 아직 없어요</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {keywords.map((k) => (
        <span
          key={k.word}
          className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[12px] font-medium text-muted"
        >
          {k.word} <span className="num text-faint">{k.count}</span>
        </span>
      ))}
    </div>
  );
}

// Most-liked mentioning unit: youtube comments jump to their video, feed items
// open the original post in a new tab.
function TopUnit({
  unit,
  video,
  onJump,
}: {
  unit: AnalysisUnit;
  video?: VideoSummary;
  onJump: (videoId: string) => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3.5 py-3">
      <p className="text-[13px] leading-relaxed text-ink">
        “{truncate(stripHtml(unit.text), 140)}”
      </p>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-faint">
          {ORIGIN_LABELS[unit.origin]}
        </span>
        <span className="shrink-0 truncate text-[12px] font-semibold text-muted">
          {unit.author}
        </span>
        {unit.likeCount > 0 && (
          <span className="num shrink-0 text-[12px] text-faint">
            ♥ {unit.likeCount.toLocaleString()}
          </span>
        )}
        {unit.videoId && video ? (
          <button
            onClick={() => onJump(unit.videoId!)}
            className="ml-auto flex min-w-0 items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-left transition-colors hover:bg-accent-soft"
          >
            <span className="relative h-4 w-7 shrink-0 overflow-hidden rounded bg-black/10">
              <Image src={video.thumbnail} alt="" fill unoptimized className="object-cover" />
            </span>
            <span className="line-clamp-1 text-[11px] font-medium text-muted">
              {video.title}
            </span>
          </button>
        ) : unit.url ? (
          <a
            href={unit.url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-accent-soft hover:text-accent"
          >
            원문 보기 ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

// Member keyword & sentiment profiles across YouTube comments + the feed
// (news/DC/Instagram), with a source filter.
export function AnalysisView({
  videos,
  onJump,
}: {
  videos: VideoSummary[];
  onJump: (videoId: string) => void;
}) {
  const all = useAllComments("relevance");
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [filter, setFilter] = useState<SourceFilter>("all");

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const r = await fetch("/api/feed");
        const d = (await r.json()) as { items?: FeedItem[] };
        if (alive) setFeedItems(d.items ?? []);
      } catch {
        // feed unavailable → analysis still works on comments alone
      } finally {
        if (alive) setFeedLoading(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, []);

  const units = useMemo<AnalysisUnit[]>(
    () => [
      ...all.map((c) => ({
        id: c.id,
        text: c.text,
        likeCount: c.likeCount,
        origin: "youtube" as const,
        author: c.author,
        videoId: c.videoId,
      })),
      ...feedItems.map((f) => {
        // A member's own IG post counts as that member's mention even when
        // the caption never says their name.
        const memberKey =
          f.source === "instagram" ? memberKeyForIgUsername(f.author) : undefined;
        return {
          id: f.id,
          text: `${f.title} ${f.snippet}`.trim(),
          likeCount: 0,
          origin: feedOrigin(f.source),
          author: f.author,
          url: f.url,
          members: memberKey ? [memberKey] : undefined,
        };
      }),
    ],
    [all, feedItems],
  );

  const filtered = useMemo(
    () => (filter === "all" ? units : units.filter((u) => u.origin === filter)),
    [units, filter],
  );
  const analysis = useMemo(() => analyzeComments(filtered), [filtered]);

  const videoMap = useMemo(
    () => new Map(videos.map((v) => [v.id, v])),
    [videos],
  );
  const loadedVideos = useMemo(
    () => new Set(all.map((c) => c.videoId)).size,
    [all],
  );
  const totalMentions = useMemo(
    () => analysis.members.reduce((n, m) => n + m.mentionCount, 0),
    [analysis],
  );
  const feedCount = units.length - all.length;

  const sourceRows = ORIGIN_ORDER.filter((o) => analysis.sources[o]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3 sm:px-6">
        <span className="text-[15px] font-bold text-ink">멤버 분석 🔬</span>
        <span className="num text-[12px] text-faint">
          유튜브 댓글 {all.length.toLocaleString()}개({loadedVideos}/{videos.length}{" "}
          영상{loadedVideos < videos.length ? ", 모으는 중…" : ""}) + 피드{" "}
          {feedLoading ? "로딩 중…" : `${feedCount.toLocaleString()}건`} 종합
        </span>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {(
            [
              { value: "all", label: "전체" },
              { value: "youtube", label: "유튜브" },
              { value: "news", label: "뉴스" },
              { value: "dc", label: "DC" },
              { value: "instagram", label: "인스타" },
            ] as const
          ).map((o) => (
            <button
              key={o.value}
              onClick={() => setFilter(o.value)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                filter === o.value
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {analysis.total === 0 ? (
        <p className="px-6 py-16 text-center text-[14px] text-faint">
          {filter === "all" ? "데이터 모으는 중이에요…" : "해당 소스 데이터가 아직 없어요"}
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          {/* Rollup for the current filter */}
          <section className="rounded-2xl border border-line bg-[var(--surface)] p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-ink">
                {filter === "all" ? "전체 감성" : `${ORIGIN_LABELS[filter]} 감성`}
                <span className="num ml-2 text-[12px] font-medium text-faint">
                  {analysis.total.toLocaleString()}건
                </span>
              </span>
              <SentimentLabels counts={analysis.sentiment} />
            </div>
            <SentimentBar counts={analysis.sentiment} />

            {/* Per-source comparison (only meaningful on 전체) */}
            {filter === "all" && sourceRows.length > 1 && (
              <div className="mt-4 flex flex-col gap-2">
                {sourceRows.map((o) => {
                  const counts = analysis.sources[o];
                  return (
                    <div key={o} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-[12px] font-semibold text-muted">
                        {ORIGIN_LABELS[o]}
                      </span>
                      <SentimentBar counts={counts} className="h-1.5" />
                      <span className="num w-32 shrink-0 text-right text-[12px] text-faint">
                        {countsTotal(counts).toLocaleString()}건 · 긍정{" "}
                        {pct(counts.positive, countsTotal(counts))}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <p className="mb-2 text-[12px] font-semibold text-faint">키워드 TOP</p>
              <KeywordChips keywords={analysis.keywords} />
            </div>
          </section>

          {/* Per-member cards, most-mentioned first */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {analysis.members.map((m) => (
              <section
                key={m.member.key}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-[var(--surface)] p-4 sm:p-5"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[16px] font-extrabold tracking-tight text-ink">
                    {m.member.name}
                  </span>
                  <span className="num text-[12px] text-faint">
                    언급 {m.mentionCount.toLocaleString()}개
                    {totalMentions > 0 && m.mentionCount > 0
                      ? ` · 전체 언급의 ${pct(m.mentionCount, totalMentions)}%`
                      : ""}
                  </span>
                </div>

                {m.mentionCount === 0 ? (
                  <p className="py-4 text-center text-[13px] text-faint">
                    아직 수집된 언급이 없어요
                  </p>
                ) : (
                  <>
                    <SentimentBar counts={m.sentiment} />
                    <SentimentLabels counts={m.sentiment} />
                    <KeywordChips keywords={m.keywords} />
                    {m.topComment && (
                      <TopUnit
                        unit={m.topComment}
                        video={
                          m.topComment.videoId
                            ? videoMap.get(m.topComment.videoId)
                            : undefined
                        }
                        onJump={onJump}
                      />
                    )}
                  </>
                )}
              </section>
            ))}
          </div>

          <p className="px-1 text-[11px] leading-relaxed text-faint">
            유튜브 각 영상의 인기 댓글 첫 페이지와 뉴스·DC·인스타 피드를 모아
            멤버 이름·애칭 언급을 찾고, 한국어 감성 어휘 사전으로 긍정·부정을
            분류한 결과예요. 통계적 참고용이며 문맥까지 완벽히 읽지는 못해요.
          </p>
        </div>
      )}
    </div>
  );
}
