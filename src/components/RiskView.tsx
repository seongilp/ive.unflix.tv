"use client";

// OSINT-style threat monitor: per-member threat levels, mention/negativity
// trends, risk-category signals, and the alert feed — all from the server-side
// risk pipeline (D1 snapshots collected every 2h by the cron worker).

import { useEffect, useMemo, useState } from "react";
import { MEMBERS } from "@/lib/analysis/members";
import { RISK_LABELS } from "@/lib/risk/terms";

interface Snap {
  ts: number;
  member: string;
  source: string;
  mentions: number;
  positive: number;
  neutral: number;
  negative: number;
  negWeighted: number;
  risk: Record<string, number>;
  keywords: { word: string; count: number }[];
}
interface AlertRow {
  ts: number;
  member: string;
  source: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
}
interface Summary {
  generatedAt: number;
  latestTs: number;
  members: Record<string, Snap[]>;
  sources: Snap[];
  alerts: AlertRow[];
}

const EN_NAMES: Record<string, string> = {
  all: "GROUP",
  yujin: "AN YUJIN",
  gaeul: "GAEUL",
  rei: "REI",
  wonyoung: "JANG WONYOUNG",
  liz: "LIZ",
  leeseo: "LEESEO",
};
const KR_NAMES: Record<string, string> = {
  all: "아이브 전체",
  ...Object.fromEntries(MEMBERS.map((m) => [m.key, m.name])),
};
const SOURCE_LABELS: Record<string, string> = {
  youtube: "유튜브",
  yt_ext: "외부 유튜브",
  news: "뉴스",
  dc: "DC",
  instagram: "인스타",
};

type Level = "CRITICAL" | "HIGH" | "ELEVATED" | "LOW" | "CALIBRATING";
const LEVEL_META: Record<Level, { label: string; color: string; glow: string }> = {
  CRITICAL: { label: "위험", color: "var(--r-crit)", glow: "rgba(251,113,133,0.35)" },
  HIGH: { label: "경계", color: "var(--r-high)", glow: "rgba(251,146,60,0.3)" },
  ELEVATED: { label: "주의", color: "var(--r-warn)", glow: "rgba(251,191,36,0.25)" },
  LOW: { label: "안정", color: "var(--r-ok)", glow: "rgba(45,212,191,0.2)" },
  CALIBRATING: { label: "관측중", color: "var(--r-muted, #8b93a7)", glow: "transparent" },
};

function negShare(s: Snap): number {
  const t = s.positive + s.neutral + s.negative;
  return t === 0 ? 0 : s.negative / t;
}

function threatLevel(trend: Snap[], alerts: AlertRow[], member: string, latestTs: number): Level {
  const dayAgo = latestTs - 24 * 60 * 60 * 1000;
  const recent = alerts.filter((a) => a.member === member && a.ts >= dayAgo);
  if (recent.some((a) => a.severity === "critical")) return "CRITICAL";
  if (recent.some((a) => a.severity === "warning")) return "HIGH";
  if (trend.length < 6) return "CALIBRATING";
  const cur = negShare(trend[trend.length - 1]);
  const prev = trend.slice(0, -1);
  const avg = prev.reduce((n, s) => n + negShare(s), 0) / prev.length;
  return cur >= avg + 0.1 ? "ELEVATED" : "LOW";
}

function fmtTime(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function ago(ts: number, now: number): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** Mentions sparkline with a soft area fill; draws in on mount. */
function Spark({ trend, color }: { trend: Snap[]; color: string }) {
  const w = 132;
  const h = 34;
  const pts = trend.map((s) => s.mentions);
  if (pts.length < 2) {
    return (
      <svg width={w} height={h} className="risk-spark">
        <line x1="0" y1={h - 6} x2={w} y2={h - 6} stroke="var(--r-line)" strokeDasharray="3 4" />
      </svg>
    );
  }
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const span = Math.max(max - min, 1);
  const xy = pts.map((v, i) => [
    (i / (pts.length - 1)) * (w - 6) + 3,
    h - 5 - ((v - min) / span) * (h - 12),
  ]);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${d} L${xy[xy.length - 1][0].toFixed(1)},${h - 2} L${xy[0][0].toFixed(1)},${h - 2} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg width={w} height={h} className="risk-spark" aria-hidden>
      <path d={area} fill={color} opacity="0.09" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" className="draw" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.4" fill={color} />
    </svg>
  );
}

/** 긍/중/부 thin stacked meter on the dark surface. */
function ToneBar({ s }: { s: Snap }) {
  const total = s.positive + s.neutral + s.negative || 1;
  const seg = (v: number, c: string, o = 1) => (
    <div
      className="h-full min-w-[3px] rounded-full"
      style={{ width: `${(v / total) * 100}%`, background: c, opacity: o }}
    />
  );
  return (
    <div className="flex h-1.5 w-full gap-[2px]">
      {s.positive > 0 && seg(s.positive, "var(--r-ok)", 0.75)}
      {s.neutral > 0 && seg(s.neutral, "#3b4356")}
      {s.negative > 0 && seg(s.negative, "var(--r-crit)")}
    </div>
  );
}

function MemberTile({
  member,
  trend,
  alerts,
  latestTs,
  index,
}: {
  member: string;
  trend: Snap[];
  alerts: AlertRow[];
  latestTs: number;
  index: number;
}) {
  const latest = trend[trend.length - 1];
  const level = threatLevel(trend, alerts, member, latestTs);
  const meta = LEVEL_META[level];
  const prev = trend.slice(0, -1);
  const avgMentions = prev.length
    ? prev.reduce((n, s) => n + s.mentions, 0) / prev.length
    : 0;
  const ratio = latest && avgMentions > 0 ? latest.mentions / avgMentions : null;
  const ns = latest ? negShare(latest) : 0;
  const riskCats = latest
    ? Object.entries(latest.risk).sort((a, z) => z[1] - a[1]).slice(0, 3)
    : [];

  return (
    <div
      className="risk-panel risk-in flex flex-col gap-3 p-4"
      style={{ animationDelay: `${90 + index * 60}ms`, boxShadow: `0 0 32px -18px ${meta.glow}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="risk-label">{EN_NAMES[member] ?? member}</div>
          <div className="mt-0.5 text-[16px] font-bold tracking-tight">{KR_NAMES[member] ?? member}</div>
        </div>
        <span
          className="risk-mono flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-[0.14em]"
          style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
          {level === "CALIBRATING" ? "CALIB" : level} · {meta.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="risk-label">Mentions / 2h</div>
          <div className="risk-mono mt-0.5 text-[22px] font-semibold leading-none">
            {latest ? latest.mentions.toLocaleString() : "—"}
            {ratio !== null && (
              <span
                className="ml-2 text-[11px]"
                style={{ color: ratio >= 1.5 ? "var(--r-warn)" : "var(--r-faint)" }}
              >
                {ratio >= 1 ? "▲" : "▼"} {ratio.toFixed(1)}×
              </span>
            )}
          </div>
        </div>
        <Spark trend={trend} color={level === "LOW" || level === "CALIBRATING" ? "#22d3ee" : meta.color} />
      </div>

      {latest && (
        <div className="flex flex-col gap-1.5">
          <ToneBar s={latest} />
          <div className="risk-mono flex items-center justify-between text-[10.5px]" style={{ color: "var(--r-muted)" }}>
            <span>
              NEG <span style={{ color: ns >= 0.25 ? "var(--r-crit)" : "var(--r-ink)" }}>{(ns * 100).toFixed(0)}%</span>
              <span className="ml-2 opacity-70">공감가중 {(latest.negWeighted * 100).toFixed(0)}%</span>
            </span>
            <span className="opacity-60">n={latest.positive + latest.neutral + latest.negative}</span>
          </div>
        </div>
      )}

      <div className="flex min-h-[22px] flex-wrap gap-1.5">
        {riskCats.length > 0 ? (
          riskCats.map(([cat, n]) => (
            <span
              key={cat}
              className="risk-mono rounded border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-1.5 py-0.5 text-[10px]"
              style={{ color: "var(--r-crit)" }}
            >
              {RISK_LABELS[cat] ?? cat} {n}
            </span>
          ))
        ) : (
          <span className="risk-mono text-[10px]" style={{ color: "var(--r-faint)" }}>
            NO RISK SIGNAL
          </span>
        )}
      </div>
    </div>
  );
}

const SEVERITY_META: Record<AlertRow["severity"], { color: string; glyph: string }> = {
  critical: { color: "var(--r-crit)", glyph: "▲" },
  warning: { color: "var(--r-warn)", glyph: "◆" },
  info: { color: "var(--r-cyan)", glyph: "●" },
};

export function RiskView() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/risk/summary");
        const j = (await r.json()) as Summary & { error?: string };
        if (!alive) return;
        if (j.error) setError(j.error);
        else setData(j);
      } catch {
        if (alive) setError("리스크 데이터를 불러오지 못했어요");
      }
    };
    void load();
    const timer = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const groupTrend = data?.members.all ?? [];
  const memberKeys = useMemo(
    () => ["all", ...MEMBERS.map((m) => m.key)],
    [],
  );
  const snapshotRuns = useMemo(
    () => new Set(groupTrend.map((s) => s.ts)).size,
    [groupTrend],
  );

  // ── Empty / initializing state ──
  if (!error && (!data || !data.latestTs)) {
    return (
      <div className="risk-root flex h-full flex-col items-center justify-center gap-6 overflow-y-auto">
        <div className="relative h-28 w-28">
          <div className="absolute inset-0 rounded-full border border-[rgba(34,211,238,0.2)]" />
          <div className="absolute inset-4 rounded-full border border-[rgba(34,211,238,0.14)]" />
          <div className="absolute inset-8 rounded-full border border-[rgba(34,211,238,0.1)]" />
          <svg viewBox="0 0 112 112" className="risk-sweep absolute inset-0">
            <defs>
              <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="rgba(34,211,238,0)" />
                <stop offset="1" stopColor="rgba(34,211,238,0.7)" />
              </linearGradient>
            </defs>
            <path d="M56 56 L56 2 A54 54 0 0 1 108 44 Z" fill="url(#sw)" opacity="0.35" />
            <line x1="56" y1="56" x2="56" y2="2" stroke="rgba(34,211,238,0.8)" strokeWidth="1.5" />
          </svg>
          <div className="risk-live-dot absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--r-cyan)]" />
        </div>
        <div className="text-center">
          <p className="risk-label mb-2">Threat Monitor · Initializing</p>
          <p className="text-[14px]" style={{ color: "var(--r-muted)" }}>
            {data ? "첫 스캔 결과를 기다리는 중이에요 — 2시간 주기로 수집합니다" : "불러오는 중…"}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="risk-root flex h-full items-center justify-center">
        <p className="text-[14px]" style={{ color: "var(--r-crit)" }}>{error}</p>
      </div>
    );
  }

  const d = data!;
  const now = d.generatedAt;
  return (
    <div className="risk-root h-full overflow-y-auto">
      <div className="relative mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        {/* ── Status bar ── */}
        <div className="risk-in flex flex-wrap items-center gap-x-4 gap-y-2" style={{ animationDelay: "0ms" }}>
          <span className="flex items-center gap-2">
            <span className="risk-live-dot h-2 w-2 rounded-full bg-[var(--r-cyan)]" />
            <span className="risk-label" style={{ color: "var(--r-cyan)" }}>Live Threat Monitor</span>
          </span>
          <span className="text-[18px] font-extrabold tracking-tight">IVE 리스크 관제</span>
          <span className="risk-mono ml-auto text-[11px]" style={{ color: "var(--r-faint)" }}>
            LAST SWEEP {fmtTime(d.latestTs)} KST · RUNS {snapshotRuns}
            {snapshotRuns < 6 ? " · 베이스라인 수집 중" : ""}
          </span>
        </div>

        {/* ── Member threat board ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {memberKeys.map((m, i) => (
            <MemberTile
              key={m}
              member={m}
              trend={d.members[m] ?? []}
              alerts={d.alerts}
              latestTs={d.latestTs}
              index={i}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          {/* ── Signal feed ── */}
          <section className="risk-panel risk-in flex flex-col p-4 lg:col-span-3" style={{ animationDelay: "540ms" }}>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="risk-label">Signal Feed</span>
              <span className="risk-mono text-[10px]" style={{ color: "var(--r-faint)" }}>
                {d.alerts.length} EVENTS
              </span>
            </div>
            {d.alerts.length === 0 ? (
              <p className="py-8 text-center text-[13px]" style={{ color: "var(--r-faint)" }}>
                감지된 위협 신호가 없어요 — 베이스라인이 쌓이면 이탈만 알립니다
              </p>
            ) : (
              <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto pr-1">
                {d.alerts.map((a, i) => {
                  const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.info;
                  return (
                    <li
                      key={`${a.ts}-${i}`}
                      className="flex items-baseline gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[rgba(148,163,184,0.06)]"
                    >
                      <span className="risk-mono shrink-0 text-[10px]" style={{ color: sev.color }}>
                        {sev.glyph}
                      </span>
                      <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed" style={{ color: "var(--r-ink)" }}>
                        {a.message}
                      </span>
                      <span className="risk-mono shrink-0 text-[10px]" style={{ color: "var(--r-faint)" }}>
                        {ago(a.ts, now)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Source matrix + keywords ── */}
          <section className="risk-panel risk-in flex flex-col gap-4 p-4 lg:col-span-2" style={{ animationDelay: "600ms" }}>
            <div>
              <div className="risk-label mb-2.5">Source Matrix</div>
              <div className="flex flex-col gap-2">
                {d.sources.length === 0 ? (
                  <p className="text-[12px]" style={{ color: "var(--r-faint)" }}>—</p>
                ) : (
                  d.sources.map((s) => (
                    <div key={s.source} className="flex items-center gap-2.5">
                      <span className="w-[74px] shrink-0 text-[11.5px] font-semibold" style={{ color: "var(--r-muted)" }}>
                        {SOURCE_LABELS[s.source] ?? s.source}
                      </span>
                      <div className="min-w-0 flex-1"><ToneBar s={s} /></div>
                      <span className="risk-mono w-[92px] shrink-0 text-right text-[10.5px]" style={{ color: "var(--r-faint)" }}>
                        {s.mentions.toLocaleString()} · N{(negShare(s) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="risk-label mb-2.5">Trending Terms</div>
              <div className="flex flex-wrap gap-1.5">
                {(groupTrend[groupTrend.length - 1]?.keywords ?? []).slice(0, 12).map((k) => (
                  <span
                    key={k.word}
                    className="risk-mono rounded border border-[var(--r-line)] px-1.5 py-0.5 text-[10.5px]"
                    style={{ color: "var(--r-muted)" }}
                  >
                    {k.word} <span style={{ color: "var(--r-faint)" }}>{k.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>

        <p className="risk-in px-1 pb-2 text-[10.5px] leading-relaxed" style={{ color: "var(--r-faint)", animationDelay: "680ms" }}>
          유튜브(공식+외부)·뉴스·DC·인스타를 2시간 주기로 수집해 각 채널의 평시 베이스라인 대비
          이탈(언급 급증·부정 여론 전환·리스크 어휘·신규 키워드)만 신호로 승격합니다. 어휘 사전 기반
          추정치이며 판단의 보조 자료로만 사용하세요.
        </p>
      </div>
    </div>
  );
}
