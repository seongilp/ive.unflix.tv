"use client";

// OSINT-style threat monitor: per-member threat levels, mention/negativity
// trends, risk-category signals, and the alert feed — all from the server-side
// risk pipeline (D1 snapshots collected every 2h by the cron worker).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
// Static avatars snapshotted from each account's Instagram profile photo
// (IG's signed CDN urls expire, so we self-host under /members). Members whose
// IG profile photo is currently blank fall back to an initial badge — list
// them here so we don't ship an empty tile.
const NO_PHOTO = new Set(["rei"]); // 레이: 현재 인스타 프로필 사진 비공개/공란
const AVATARS: Record<string, string | null> = {
  all: "/members/all.jpg",
  ...Object.fromEntries(
    MEMBERS.map((m) => [m.key, NO_PHOTO.has(m.key) ? null : `/members/${m.key}.jpg`]),
  ),
};
// Gradient tint per member for the initial-badge fallback.
const AVATAR_TINT: Record<string, [string, string]> = {
  all: ["#22d3ee", "#0e7490"],
  yujin: ["#f0abfc", "#a21caf"],
  gaeul: ["#fdba74", "#c2410c"],
  rei: ["#7dd3fc", "#2563eb"],
  wonyoung: ["#fda4af", "#be123c"],
  liz: ["#a5b4fc", "#4338ca"],
  leeseo: ["#6ee7b7", "#047857"],
};

function Avatar({ member, ring }: { member: string; ring: string }) {
  const src = AVATARS[member];
  const [tone1, tone2] = AVATAR_TINT[member] ?? ["#334155", "#0f172a"];
  const initial = (KR_NAMES[member] ?? member).slice(member === "all" ? 3 : 0, member === "all" ? 4 : 1);
  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        boxShadow: `0 0 0 1.5px color-mix(in srgb, ${ring} 55%, transparent)`,
        background: src ? undefined : `linear-gradient(140deg, ${tone1}, ${tone2})`,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.opacity = "0"; }}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[14px] font-bold text-white/95">{initial}</span>
      )}
    </span>
  );
}
const SOURCE_LABELS: Record<string, string> = {
  youtube: "유튜브",
  yt_ext: "외부 유튜브",
  news: "뉴스",
  dc: "DC",
  pann: "네이트판",
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

const LEVEL_RANK: Record<Level, number> = {
  CRITICAL: 4, HIGH: 3, ELEVATED: 2, LOW: 1, CALIBRATING: 0,
};

interface ExecSummary {
  overall: Level;
  headline: string;
  bullets: string[];
  calibrating: boolean;
  runs: number;
}

// Roll the member board + alerts into a one-glance executive read.
function buildSummary(
  members: Record<string, Snap[]>,
  alerts: AlertRow[],
  latestTs: number,
  runs: number,
): ExecSummary {
  const memberKeys = MEMBERS.map((m) => m.key);
  const levels = memberKeys.map((m) => ({
    m,
    level: threatLevel(members[m] ?? [], alerts, m, latestTs),
  }));
  const overall = levels.reduce<Level>(
    (worst, x) => (LEVEL_RANK[x.level] > LEVEL_RANK[worst] ? x.level : worst),
    threatLevel(members.all ?? [], alerts, "all", latestTs),
  );
  const calibrating = runs < 6;

  const dayAgo = latestTs - 24 * 60 * 60 * 1000;
  const recent = alerts.filter((a) => a.ts >= dayAgo);
  const crit = recent.filter((a) => a.severity === "critical").length;
  const warn = recent.filter((a) => a.severity === "warning").length;

  const group = members.all ?? [];
  const latest = group[group.length - 1];
  const totalMentions = latest?.mentions ?? 0;
  const prev = group.slice(0, -1);
  const avgMentions = prev.length
    ? prev.reduce((n, s) => n + s.mentions, 0) / prev.length
    : 0;
  const momentum = latest && avgMentions > 0 ? latest.mentions / avgMentions : null;

  // Members ranked by threat, then by negativity, for the watchlist line.
  const flagged = levels
    .filter((x) => LEVEL_RANK[x.level] >= LEVEL_RANK.ELEVATED)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level])
    .map((x) => KR_NAMES[x.m]);

  let headline: string;
  if (calibrating) {
    headline = "베이스라인 수집 중 — 평시 패턴이 잡히면 이탈 신호를 판정합니다";
  } else if (overall === "CRITICAL") {
    headline = "위험 신호 감지 — 즉시 확인이 필요한 이탈이 있습니다";
  } else if (overall === "HIGH") {
    headline = "경계 구간 — 평시 대비 뚜렷한 이탈이 관측됩니다";
  } else if (overall === "ELEVATED") {
    headline = "주의 구간 — 일부 지표가 평시보다 높습니다";
  } else {
    headline = "안정 — 모든 채널이 평시 범위 안에서 움직입니다";
  }

  const bullets: string[] = [];
  bullets.push(
    crit > 0 || warn > 0
      ? `최근 24시간 활성 알림 ${crit + warn}건 (위험 ${crit} · 경계 ${warn})`
      : "최근 24시간 활성 알림 없음",
  );
  if (totalMentions > 0) {
    bullets.push(
      momentum !== null
        ? `총 언급량 ${totalMentions.toLocaleString()}건 · 평시 대비 ${momentum >= 1 ? "▲" : "▼"}${momentum.toFixed(1)}배`
        : `총 언급량 ${totalMentions.toLocaleString()}건 (기준선 수집 전)`,
    );
  }
  bullets.push(
    flagged.length > 0
      ? `주시 대상: ${flagged.slice(0, 3).join(" · ")}`
      : "주시 대상 멤버 없음 — 전원 평시 범위",
  );
  return { overall, headline, bullets, calibrating, runs };
}

function ExecPanel({ summary }: { summary: ExecSummary }) {
  const meta = LEVEL_META[summary.overall];
  return (
    <div
      className="risk-panel risk-in flex flex-col justify-between p-5"
      style={{ animationDelay: "120ms", boxShadow: `0 0 40px -20px ${meta.glow}` }}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="risk-label" style={{ color: "var(--r-cyan)" }}>
            Executive Summary
          </span>
          <span
            className="risk-mono flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-[0.14em]"
            style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
            THREAT {summary.calibrating ? "—" : summary.overall} · {meta.label}
          </span>
        </div>
        <p className="mt-3 text-[15px] font-semibold leading-snug" style={{ color: "var(--r-ink)" }}>
          {summary.headline}
        </p>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5">
        {summary.bullets.map((b, i) => (
          <li key={i} className="flex items-baseline gap-2 text-[12.5px]" style={{ color: "var(--r-muted)" }}>
            <span className="risk-mono shrink-0 text-[9px]" style={{ color: "var(--r-cyan)" }}>▸</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Catmull-Rom → cubic-bezier: a smooth curve through every point (no
// overshoot control needed for monotone-ish series like these).
function smoothPath(xy: number[][], tension = 0.5): string {
  if (xy.length < 2) return "";
  if (xy.length === 2) return `M${xy[0][0]},${xy[0][1]} L${xy[1][0]},${xy[1][1]}`;
  let d = `M${xy[0][0].toFixed(1)},${xy[0][1].toFixed(1)}`;
  for (let i = 0; i < xy.length - 1; i++) {
    const p0 = xy[i - 1] ?? xy[i];
    const p1 = xy[i];
    const p2 = xy[i + 1];
    const p3 = xy[i + 2] ?? p2;
    const c1x = p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2;
    const c1y = p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2;
    const c2x = p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2;
    const c2y = p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Mentions sparkline — smooth curve, gradient area fill; draws in on mount. */
function Spark({ trend, color, uid }: { trend: Snap[]; color: string; uid: string }) {
  const w = 132;
  const h = 36;
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
    h - 6 - ((v - min) / span) * (h - 14),
  ]);
  const line = smoothPath(xy);
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${h} L${xy[0][0].toFixed(1)},${h} Z`;
  const [lx, ly] = xy[xy.length - 1];
  const gid = `sp-${uid}`;
  return (
    <svg width={w} height={h} className="risk-spark" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" className="draw" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3.2" fill={color} opacity="0.25" />
      <circle cx={lx} cy={ly} r="2" fill={color} />
    </svg>
  );
}

// Words that also appear as risk-category stems get flagged red in the cloud.
const RISK_WORD_SET = new Set(
  Object.values(RISK_LABELS).flatMap((l) => l.split("·")),
);
function isRiskWord(w: string): boolean {
  return [...RISK_WORD_SET].some((r) => w.includes(r)) ||
    /논란|사과|해명|입장|의혹|폭로|열애|불참|중단|탈퇴/.test(w);
}

// ── Chatter cloud ───────────────────────────────────────────────────────────
// Interactive keyword cloud: pick a scope (그룹/멤버/채널), scrub the snapshot
// timeline, weight by raw frequency or by lift over the previous run, filter to
// risk vocabulary, and drill into a single word. Layout is a seeded Archimedean
// spiral with AABB collision — the seed folds in scope/snapshot/mode/shuffle so
// two different reads never land on the same arrangement.

const CLOUD_W = 480;
const CLOUD_H = 252;
const CLOUD_MAX_WORDS = 34;
const CLOUD_STEP_MS = 1200;

type CloudMode = "count" | "delta";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Hangul/CJK glyphs are ~1em wide, latin much narrower. The old flat 0.62em
// estimate under-measured Korean words, which is why tiles collided.
const WIDE_GLYPH = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]/;
function textWidth(word: string, size: number): number {
  let em = 0;
  for (const ch of word) {
    if (WIDE_GLYPH.test(ch)) em += 1;
    else if (/[A-Z0-9]/.test(ch)) em += 0.64;
    else if (/[a-z]/.test(ch)) em += 0.55;
    else em += 0.4;
  }
  return em * size;
}

interface CloudItem {
  word: string;
  count: number;
  delta: number;
  weight: number;
  risky: boolean;
  fresh: boolean; // absent from the previous snapshot
}
interface CloudNode extends CloudItem {
  size: number;
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  rank: number;
}

function layoutCloud(items: CloudItem[], seed: number): CloudNode[] {
  if (items.length === 0) return [];
  const rnd = mulberry32(seed);
  const max = items[0].weight;
  const min = items[items.length - 1].weight || 1;
  const a0 = rnd() * Math.PI * 2;
  const dir = rnd() < 0.5 ? 1 : -1;

  interface Box { x: number; y: number; w: number; h: number }
  const placed: Box[] = [];
  const hit = (b: Box) =>
    placed.some(
      (p) => Math.abs(p.x - b.x) * 2 < p.w + b.w && Math.abs(p.y - b.y) * 2 < p.h + b.h,
    );

  const nodes: CloudNode[] = [];
  items.forEach((it, rank) => {
    const t = (it.weight - min) / Math.max(1, max - min);
    const size = 12 + Math.round(Math.pow(t, 0.62) * 28); // 12–40px
    // A few mid-weight words stand on end — breaks the "same blob" look.
    const rot = rank >= 3 && size <= 22 && rnd() < 0.2 ? -90 : 0;
    const tw = textWidth(it.word, size) + 7;
    const th = size * 1.2;
    const bw = rot ? th : tw;
    const bh = rot ? tw : th;

    for (let step = 0; step < 2600; step++) {
      const prog = 0.36 * step;
      const angle = a0 + dir * prog;
      const rad = 4 + 2.5 * prog;
      const x = Math.cos(angle) * rad;
      const y = Math.sin(angle) * rad * 0.6; // squash vertically to fill the panel
      const box = { x, y, w: bw, h: bh };
      if (
        Math.abs(x) + bw / 2 < CLOUD_W / 2 &&
        Math.abs(y) + bh / 2 < CLOUD_H / 2 &&
        !hit(box)
      ) {
        placed.push(box);
        nodes.push({ ...it, size, x, y, rot, w: tw, h: th, rank });
        return;
      }
    }
    // No free slot inside the panel — drop the word rather than overlap.
  });
  return nodes;
}

/** Per-word count history across the scrubbed snapshot series. */
function WordBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const n = values.length;
  return (
    <svg viewBox={`0 0 ${n * 4} 16`} className="h-4 w-full" preserveAspectRatio="none" aria-hidden>
      {values.map((v, i) => (
        <rect
          key={i}
          x={i * 4}
          y={16 - Math.max(1, (v / max) * 16)}
          width={2.6}
          height={Math.max(1, (v / max) * 16)}
          rx={1}
          fill={color}
          opacity={i === n - 1 ? 1 : 0.45}
        />
      ))}
    </svg>
  );
}

function CloudChip({
  on,
  tone = "var(--r-cyan)",
  onClick,
  title,
  children,
}: {
  on: boolean;
  tone?: string;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className="rounded-full border px-2.5 py-[3px] text-[11px] font-semibold leading-none transition-colors"
      style={{
        borderColor: on ? `color-mix(in srgb, ${tone} 55%, transparent)` : "var(--r-line)",
        background: on ? `color-mix(in srgb, ${tone} 14%, transparent)` : "transparent",
        color: on ? tone : "var(--r-muted)",
      }}
    >
      {children}
    </button>
  );
}

function ChatterCloud({
  members,
  sources,
}: {
  members: Record<string, Snap[]>;
  sources: Snap[];
}) {
  const [scopeId, setScopeId] = useState("m:all");
  const [mode, setMode] = useState<CloudMode>("count");
  const [riskOnly, setRiskOnly] = useState(false);
  const [shuffle, setShuffle] = useState(0);
  const [tIdx, setTIdx] = useState<number | null>(null); // null = follow latest
  const [playing, setPlaying] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const series = useMemo<Snap[]>(() => {
    if (scopeId.startsWith("s:")) {
      const row = sources.find((s) => s.source === scopeId.slice(2));
      return row ? [row] : [];
    }
    return members[scopeId.slice(2)] ?? [];
  }, [scopeId, members, sources]);

  const last = series.length - 1;
  const idx = Math.max(0, Math.min(last, tIdx ?? last));
  const snap = series[idx];
  const prev = idx > 0 ? series[idx - 1] : undefined;
  const scrubbable = series.length > 1;

  // Timeline playback — steps through the retained snapshots and loops.
  useEffect(() => {
    if (!playing || !scrubbable) return;
    const timer = setInterval(
      () => setTIdx((i) => ((i ?? last) + 1) % series.length),
      CLOUD_STEP_MS,
    );
    return () => clearInterval(timer);
  }, [playing, scrubbable, series.length, last]);

  const totalCount = useMemo(
    () => snap?.keywords.reduce((n, k) => n + k.count, 0) ?? 0,
    [snap],
  );

  const items = useMemo<CloudItem[]>(() => {
    if (!snap) return [];
    const before = new Map(prev?.keywords.map((k) => [k.word, k.count]) ?? []);
    return snap.keywords
      .map((k) => {
        const had = before.get(k.word);
        const delta = prev ? k.count - (had ?? 0) : 0;
        return {
          word: k.word,
          count: k.count,
          delta,
          // No previous run means no lift to show — 급상승 renders its empty state.
          weight: mode === "delta" ? Math.max(0, delta) : k.count,
          risky: isRiskWord(k.word),
          fresh: prev !== undefined && had === undefined,
        };
      })
      .filter((k) => (riskOnly ? k.risky : true) && k.weight > 0)
      .sort((a, b) => b.weight - a.weight || b.count - a.count)
      .slice(0, CLOUD_MAX_WORDS);
  }, [snap, prev, mode, riskOnly]);

  const nodes = useMemo(
    () => layoutCloud(items, hashSeed(`${scopeId}|${snap?.ts ?? 0}|${mode}|${riskOnly}|${shuffle}`)),
    [items, scopeId, snap?.ts, mode, riskOnly, shuffle],
  );

  const focusWord = pinned ?? hovered;
  const focus = nodes.find((n) => n.word === focusWord);
  const history = useMemo(
    () =>
      focus
        ? series.map((s) => s.keywords.find((k) => k.word === focus.word)?.count ?? 0)
        : [],
    [focus, series],
  );
  // The per-source rows are group-wide and only exist for the latest run, so the
  // channel split is meaningful only for the group scope at the newest snapshot.
  const channels = useMemo(() => {
    if (!focus || scopeId !== "m:all" || idx !== last) return [];
    return sources
      .map((s) => ({
        source: s.source,
        count: s.keywords.find((k) => k.word === focus.word)?.count ?? 0,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [focus, sources, scopeId, idx, last]);

  const pickScope = (id: string) => {
    setScopeId(id);
    setTIdx(null);
    setPinned(null);
    setHovered(null);
    setPlaying(false);
  };
  // Arrow keys walk the cloud by rank so it's usable without a pointer.
  const step = (dir: 1 | -1) => {
    if (nodes.length === 0) return;
    const at = nodes.findIndex((n) => n.word === focusWord);
    const next = nodes[(at + dir + nodes.length) % nodes.length] ?? nodes[0];
    setPinned(next.word);
    setHovered(null);
  };

  const scopeLabel = scopeId.startsWith("s:")
    ? (SOURCE_LABELS[scopeId.slice(2)] ?? scopeId.slice(2))
    : (KR_NAMES[scopeId.slice(2)] ?? scopeId.slice(2));

  return (
    <section className="risk-panel risk-in flex flex-col p-4 sm:p-5" style={{ animationDelay: "660ms" }}>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <span className="risk-label">
          Chatter Cloud · {scopeLabel}
          {mode === "delta" ? " · 급상승" : ""}
        </span>
        <span className="risk-mono flex items-center gap-3 text-[10px]" style={{ color: "var(--r-faint)" }}>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--r-cyan)]" />일반</span>
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--r-crit)]" />리스크 어휘</span>
          <span>{fmtTime(snap?.ts ?? 0)}</span>
        </span>
      </div>

      {/* Scope: 그룹·멤버 / 채널 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <CloudChip on={scopeId === "m:all"} onClick={() => pickScope("m:all")}>전체</CloudChip>
        {MEMBERS.map((m) => (
          <CloudChip key={m.key} on={scopeId === `m:${m.key}`} onClick={() => pickScope(`m:${m.key}`)}>
            {m.name}
          </CloudChip>
        ))}
        {sources.length > 0 && <span className="mx-1 h-3 w-px" style={{ background: "var(--r-line)" }} />}
        {sources.map((s) => (
          <CloudChip
            key={s.source}
            on={scopeId === `s:${s.source}`}
            tone="var(--r-ok)"
            title="최근 스캔 1회"
            onClick={() => pickScope(`s:${s.source}`)}
          >
            {SOURCE_LABELS[s.source] ?? s.source}
          </CloudChip>
        ))}
      </div>

      {/* Weighting · filter · layout · timeline */}
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <CloudChip on={mode === "count"} onClick={() => setMode("count")} title="언급 빈도로 크기 결정">빈도</CloudChip>
          <CloudChip
            on={mode === "delta"}
            tone="var(--r-warn)"
            onClick={() => setMode("delta")}
            title="직전 스캔 대비 증가량으로 크기 결정"
          >
            급상승
          </CloudChip>
          <CloudChip on={riskOnly} tone="var(--r-crit)" onClick={() => setRiskOnly((v) => !v)}>
            리스크만
          </CloudChip>
          <button
            type="button"
            onClick={() => setShuffle((s) => s + 1)}
            title="배치 다시 굴리기"
            className="rounded-full border px-2.5 py-[3px] text-[11px] font-semibold leading-none transition-colors hover:text-[var(--r-ink)]"
            style={{ borderColor: "var(--r-line)", color: "var(--r-muted)" }}
          >
            ⤿ 재배치
          </button>
        </div>
        {scrubbable && (
          <div className="flex min-w-[190px] flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "타임라인 정지" : "타임라인 재생"}
              className="risk-mono text-[11px]"
              style={{ color: playing ? "var(--r-cyan)" : "var(--r-muted)" }}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={last}
              value={idx}
              onChange={(e) => {
                setTIdx(Number(e.target.value));
                setPlaying(false);
              }}
              aria-label="스냅샷 타임라인"
              className="h-3 min-w-0 flex-1 cursor-pointer"
              style={{ accentColor: "var(--r-cyan)" }}
            />
            <span className="risk-mono shrink-0 text-[10px]" style={{ color: "var(--r-faint)" }}>
              RUN {idx + 1}/{series.length}
            </span>
          </div>
        )}
      </div>

      {nodes.length === 0 ? (
        <p className="py-12 text-center text-[12px]" style={{ color: "var(--r-faint)" }}>
          {!snap
            ? "키워드 수집 전이에요"
            : mode === "delta" && !prev
              ? "이 스캔이 첫 관측이라 비교할 직전 데이터가 없어요"
              : riskOnly
                ? mode === "delta"
                  ? "직전 스캔 대비 늘어난 리스크 어휘가 없어요"
                  : "이 스캔에서 리스크 어휘는 감지되지 않았어요"
                : mode === "delta"
                  ? "직전 스캔 대비 늘어난 어휘가 없어요"
                  : "키워드 수집 전이에요"}
        </p>
      ) : (
        <svg
          viewBox={`${-CLOUD_W / 2} ${-CLOUD_H / 2} ${CLOUD_W} ${CLOUD_H}`}
          className="h-auto w-full focus:outline-none"
          tabIndex={0}
          role="group"
          aria-label="키워드 클라우드 — 좌우 방향키로 단어 이동"
          onPointerLeave={() => setHovered(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); step(1); }
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); step(-1); }
            else if (e.key === "Escape") setPinned(null);
          }}
        >
          <defs>
            {/* Diagonal gradients — brighter core, deeper tail, for depth. */}
            <linearGradient id="wc-hot" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#e0fbff" />
              <stop offset="0.5" stopColor="#38e8ff" />
              <stop offset="1" stopColor="#0ea5c4" />
            </linearGradient>
            <linearGradient id="wc-cool" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#bfe9ff" />
              <stop offset="0.55" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#4b93c9" />
            </linearGradient>
            <linearGradient id="wc-faint" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#aab6cc" />
              <stop offset="1" stopColor="#5b667e" />
            </linearGradient>
            <linearGradient id="wc-crit" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0" stopColor="#ffd9df" />
              <stop offset="0.5" stopColor="#fb7185" />
              <stop offset="1" stopColor="#d1425c" />
            </linearGradient>
            {/* Soft outer glow; strength dialed per-word below. */}
            <filter id="wc-glow-strong" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#22d3ee" floodOpacity="0.55" />
            </filter>
            <filter id="wc-glow-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#22d3ee" floodOpacity="0.3" />
            </filter>
            <filter id="wc-glow-crit" x="-45%" y="-45%" width="190%" height="190%">
              <feDropShadow dx="0" dy="0" stdDeviation="7" floodColor="#fb7185" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Background click target — clears the pinned word. */}
          <rect
            x={-CLOUD_W / 2}
            y={-CLOUD_H / 2}
            width={CLOUD_W}
            height={CLOUD_H}
            fill="transparent"
            onClick={() => setPinned(null)}
          />

          {nodes.map((n) => {
            const lit = focusWord === n.word;
            const dim = focusWord !== null && !lit;
            const filter = lit
              ? n.risky ? "url(#wc-glow-crit)" : "url(#wc-glow-strong)"
              : n.risky
                ? "url(#wc-glow-crit)"
                : n.size >= 26
                  ? "url(#wc-glow-strong)"
                  : n.size >= 18
                    ? "url(#wc-glow-soft)"
                    : undefined;
            const grad = n.risky
              ? "wc-crit"
              : n.rank < 3
                ? "wc-hot"
                : n.rank < 10
                  ? "wc-cool"
                  : "wc-faint";
            return (
              <g
                key={n.word}
                className="wc-node"
                transform={`translate(${n.x},${n.y}) rotate(${n.rot})`}
                onPointerEnter={() => setHovered(n.word)}
                onClick={(e) => {
                  e.stopPropagation();
                  setPinned((p) => (p === n.word ? null : n.word));
                }}
                style={{ cursor: "pointer" }}
              >
                <g className="wc-pop" style={{ animationDelay: `${60 + n.rank * 20}ms` }}>
                  {lit && (
                    <rect
                      x={-n.w / 2}
                      y={-n.h / 2}
                      width={n.w}
                      height={n.h}
                      rx={n.h * 0.3}
                      fill={n.risky ? "rgba(251,113,133,0.12)" : "rgba(34,211,238,0.12)"}
                      stroke={n.risky ? "rgba(251,113,133,0.45)" : "rgba(34,211,238,0.45)"}
                      strokeWidth="0.8"
                    />
                  )}
                  {/* Hit area — the glyph outline alone is a fussy target. */}
                  <rect
                    x={-n.w / 2}
                    y={-n.h / 2}
                    width={n.w}
                    height={n.h}
                    fill="transparent"
                    pointerEvents="all"
                  />
                  <text
                    className="wc-word"
                    fontWeight={n.size > 26 ? 800 : n.size > 18 ? 700 : 600}
                    fill={`url(#${grad})`}
                    filter={filter}
                    textAnchor="middle"
                    dominantBaseline="central"
                    pointerEvents="none"
                    style={{
                      fontSize: n.size,
                      fontFamily: "Pretendard, sans-serif",
                      opacity: dim ? 0.22 : n.risky || lit ? 1 : n.size < 16 ? 0.85 : 0.96,
                    }}
                  >
                    {n.word}
                  </text>
                  {(n.risky || (mode === "delta" && n.rank < 6)) && !dim && (
                    <text
                      y={n.h / 2 + 4}
                      fontSize={7}
                      fill={n.risky ? "var(--r-crit)" : "var(--r-warn)"}
                      textAnchor="middle"
                      opacity="0.75"
                      pointerEvents="none"
                      style={{ letterSpacing: "0.1em" }}
                    >
                      ▲{mode === "delta" ? n.delta : n.count}
                    </text>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      )}

      {/* Drilldown strip */}
      <div
        className="mt-1 flex min-h-[42px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2.5 py-2"
        style={{ background: "rgba(148,163,184,0.05)", border: "1px solid var(--r-line)" }}
      >
        {!focus ? (
          <span className="text-[11.5px]" style={{ color: "var(--r-faint)" }}>
            단어를 올리거나 클릭하면 스캔별 추이와 채널 분포가 열려요 · 방향키로도 이동해요
          </span>
        ) : (
          <>
            <span
              className="text-[14px] font-extrabold"
              style={{ color: focus.risky ? "var(--r-crit)" : "var(--r-cyan)" }}
            >
              {focus.word}
            </span>
            <span className="risk-mono text-[10.5px]" style={{ color: "var(--r-muted)" }}>
              {focus.count.toLocaleString()}회 · 비중 {totalCount ? ((focus.count / totalCount) * 100).toFixed(1) : "0.0"}%
            </span>
            {prev && (
              <span
                className="risk-mono text-[10.5px]"
                style={{
                  color: focus.fresh
                    ? "var(--r-warn)"
                    : focus.delta > 0
                      ? "var(--r-cyan)"
                      : "var(--r-faint)",
                }}
              >
                {focus.fresh
                  ? "신규 등장"
                  : `직전 대비 ${focus.delta >= 0 ? "+" : ""}${focus.delta}`}
              </span>
            )}
            {channels.length > 0 && (
              <span className="risk-mono text-[10.5px]" style={{ color: "var(--r-faint)" }}>
                채널 {channels
                  .map((c) => `${SOURCE_LABELS[c.source] ?? c.source} ${c.count}`)
                  .join(" · ")}
              </span>
            )}
            {history.length > 1 && (
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="risk-mono text-[10px]" style={{ color: "var(--r-faint)" }}>
                  최근 {history.length}회
                </span>
                <span className="w-[110px]">
                  <WordBars values={history} color={focus.risky ? "#fb7185" : "#22d3ee"} />
                </span>
              </span>
            )}
          </>
        )}
      </div>
    </section>
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
  onOpen,
}: {
  member: string;
  trend: Snap[];
  alerts: AlertRow[];
  latestTs: number;
  index: number;
  onOpen: (member: string) => void;
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
    <button
      type="button"
      onClick={() => onOpen(member)}
      className="risk-panel risk-tile risk-in flex flex-col gap-3 p-4 text-left"
      style={{ animationDelay: `${90 + index * 60}ms`, boxShadow: `0 0 32px -18px ${meta.glow}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar member={member} ring={meta.color} />
          <div className="min-w-0">
            <div className="risk-label truncate">{EN_NAMES[member] ?? member}</div>
            <div className="mt-0.5 truncate text-[16px] font-bold tracking-tight">{KR_NAMES[member] ?? member}</div>
          </div>
        </div>
        <span
          className="risk-mono flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-[0.14em]"
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
        <Spark trend={trend} uid={member} color={level === "LOW" || level === "CALIBRATING" ? "#22d3ee" : meta.color} />
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
        <span className="risk-detail-cue risk-mono ml-auto self-center text-[10px]" style={{ color: "var(--r-cyan)" }}>
          상세 →
        </span>
      </div>
    </button>
  );
}

const SEVERITY_META: Record<AlertRow["severity"], { color: string; glyph: string }> = {
  critical: { color: "var(--r-crit)", glyph: "▲" },
  warning: { color: "var(--r-warn)", glyph: "◆" },
  info: { color: "var(--r-cyan)", glyph: "●" },
};

interface MemberDetail {
  member: string;
  latestTs: number;
  trend: Snap[];
  sources: Snap[];
  alerts: AlertRow[];
}

// Large dual-line area chart: mentions (left, curve+fill) and negativity %
// (right, thin curve). Hover crosshair reads out both at that snapshot.
function DetailChart({ trend }: { trend: Snap[] }) {
  const W = 640;
  const H = 210;
  const padX = 8;
  const padTop = 16;
  const padBot = 26;
  const [hover, setHover] = useState<number | null>(null);

  if (trend.length < 2) {
    return (
      <div className="flex h-[180px] items-center justify-center text-[12px]" style={{ color: "var(--r-faint)" }}>
        추세를 그리려면 스냅샷이 2개 이상 필요해요 (2시간 주기 수집 중)
      </div>
    );
  }
  const mentions = trend.map((s) => s.mentions);
  const negs = trend.map((s) => negShare(s) * 100);
  const mMax = Math.max(...mentions, 1);
  const mMin = Math.min(...mentions);
  const mSpan = Math.max(mMax - mMin, 1);
  const nMax = Math.max(...negs, 10);

  const xAt = (i: number) => padX + (i / (trend.length - 1)) * (W - padX * 2);
  const yMent = (v: number) => padTop + (1 - (v - mMin) / mSpan) * (H - padTop - padBot);
  const yNeg = (v: number) => padTop + (1 - v / nMax) * (H - padTop - padBot);

  const mXY = mentions.map((v, i) => [xAt(i), yMent(v)]);
  const nXY = negs.map((v, i) => [xAt(i), yNeg(v)]);
  const mLine = smoothPath(mXY);
  const mArea = `${mLine} L${xAt(trend.length - 1).toFixed(1)},${H - padBot} L${xAt(0).toFixed(1)},${H - padBot} Z`;
  const nLine = smoothPath(nXY);

  const hi = hover ?? trend.length - 1;
  const hs = trend[hi];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((rx - padX) / (W - padX * 2)) * (trend.length - 1));
          setHover(Math.max(0, Math.min(trend.length - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id="dc-ment" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity="0.3" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* baseline grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={W - padX} y1={padTop + f * (H - padTop - padBot)} y2={padTop + f * (H - padTop - padBot)} stroke="var(--r-line)" strokeWidth="1" />
        ))}
        <path d={mArea} fill="url(#dc-ment)" />
        <path d={mLine} fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={nLine} fill="none" stroke="var(--r-crit)" strokeWidth="1.6" strokeDasharray="1 3" strokeLinecap="round" opacity="0.85" />
        {/* crosshair */}
        <line x1={xAt(hi)} x2={xAt(hi)} y1={padTop} y2={H - padBot} stroke="var(--r-cyan)" strokeWidth="1" opacity="0.4" />
        <circle cx={xAt(hi)} cy={yMent(mentions[hi])} r="3.5" fill="#22d3ee" />
        <circle cx={xAt(hi)} cy={yNeg(negs[hi])} r="3" fill="var(--r-crit)" />
      </svg>
      <div className="risk-mono pointer-events-none absolute right-2 top-1 rounded-md border border-[var(--r-line)] bg-[rgba(7,11,22,0.85)] px-2 py-1 text-[10px]" style={{ color: "var(--r-muted)" }}>
        <span style={{ color: "#22d3ee" }}>언급 {hs.mentions.toLocaleString()}</span>
        {" · "}
        <span style={{ color: "var(--r-crit)" }}>부정 {(negShare(hs) * 100).toFixed(0)}%</span>
        <div className="mt-0.5 opacity-60">{fmtTime(hs.ts)}</div>
      </div>
    </div>
  );
}

function DetailModal({
  member,
  fallbackTrend,
  fallbackAlerts,
  latestTs,
  onClose,
}: {
  member: string;
  fallbackTrend: Snap[];
  fallbackAlerts: AlertRow[];
  latestTs: number;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(`/api/risk/member?key=${member}`);
        const j = (await r.json()) as MemberDetail & { error?: string };
        if (alive && !j.error) setDetail(j);
      } catch { /* fall back to summary-provided data */ }
    })();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [member, onClose]);

  const trend = detail?.trend ?? fallbackTrend;
  const alerts = detail?.alerts ?? fallbackAlerts.filter((a) => a.member === member);
  const sources = detail?.sources ?? [];
  const latest = trend[trend.length - 1];
  const level = threatLevel(trend, alerts, member, latestTs);
  const meta = LEVEL_META[level];
  const keywords = latest?.keywords ?? [];
  const riskCats = latest ? Object.entries(latest.risk).sort((a, z) => z[1] - a[1]) : [];
  const now = detail?.latestTs || latestTs;
  // Only portals on the client; the modal never renders during SSR anyway
  // (it's mounted from a click handler).
  if (typeof document === "undefined") return null;

  return createPortal(
    // Inline position:fixed — `.risk-root { position: relative }` would
    // otherwise beat Tailwind's `fixed` and drop the modal below the fold.
    <div
      className="risk-root z-[100] flex items-start justify-center overflow-y-auto p-3 sm:p-6"
      style={{ position: "fixed", inset: 0, background: "rgba(4,7,14,0.72)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div className="risk-modal-in risk-panel relative my-auto w-full max-w-4xl p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar member={member} ring={meta.color} />
            <div>
              <div className="risk-label">{EN_NAMES[member] ?? member} · Detail</div>
              <div className="text-[19px] font-extrabold tracking-tight">{KR_NAMES[member] ?? member}</div>
            </div>
            <span
              className="risk-mono ml-1 flex items-center gap-1.5 self-center rounded-md border px-2 py-1 text-[10px] font-semibold tracking-[0.14em]"
              style={{ color: meta.color, borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              {level === "CALIBRATING" ? "관측중" : level} · {meta.label}
            </span>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-[var(--r-muted)] transition-colors hover:bg-[rgba(148,163,184,0.1)] hover:text-[var(--r-ink)]" aria-label="닫기">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* KPI row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { l: "최근 언급 / 2h", v: latest ? latest.mentions.toLocaleString() : "—", c: "#22d3ee" },
            { l: "부정 여론", v: latest ? `${(negShare(latest) * 100).toFixed(0)}%` : "—", c: latest && negShare(latest) >= 0.25 ? "var(--r-crit)" : "var(--r-ink)" },
            { l: "공감가중 부정", v: latest ? `${(latest.negWeighted * 100).toFixed(0)}%` : "—", c: "var(--r-ink)" },
            { l: "24h 알림", v: String(alerts.filter((a) => a.ts >= now - 864e5).length), c: "var(--r-warn)" },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-[var(--r-line)] p-3">
              <div className="risk-label">{k.l}</div>
              <div className="risk-mono mt-1 text-[20px] font-semibold" style={{ color: k.c }}>{k.v}</div>
            </div>
          ))}
        </div>

        {/* chart */}
        <div className="mt-4 rounded-xl border border-[var(--r-line)] p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="risk-label">Mentions & Negativity · 추세</span>
            <span className="risk-mono flex items-center gap-3 text-[10px]" style={{ color: "var(--r-faint)" }}>
              <span className="flex items-center gap-1"><span className="h-[2px] w-3" style={{ background: "#22d3ee" }} />언급량</span>
              <span className="flex items-center gap-1"><span className="h-[2px] w-3" style={{ background: "var(--r-crit)" }} />부정률</span>
            </span>
          </div>
          <DetailChart trend={trend} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* source breakdown */}
          <div className="rounded-xl border border-[var(--r-line)] p-4">
            <div className="risk-label mb-2.5">소스별 분해 · 최근</div>
            {sources.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--r-faint)" }}>이 멤버의 소스별 데이터가 아직 없어요</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sources.sort((a, b) => b.mentions - a.mentions).map((s) => (
                  <div key={s.source} className="flex items-center gap-2.5">
                    <span className="w-[74px] shrink-0 text-[11.5px] font-semibold" style={{ color: "var(--r-muted)" }}>{SOURCE_LABELS[s.source] ?? s.source}</span>
                    <div className="min-w-0 flex-1"><ToneBar s={s} /></div>
                    <span className="risk-mono w-[92px] shrink-0 text-right text-[10.5px]" style={{ color: "var(--r-faint)" }}>{s.mentions.toLocaleString()} · N{(negShare(s) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="risk-label mb-2 mt-4">리스크 카테고리</div>
            <div className="flex flex-wrap gap-1.5">
              {riskCats.length > 0 ? riskCats.map(([cat, n]) => (
                <span key={cat} className="risk-mono rounded border border-[rgba(251,113,133,0.25)] bg-[rgba(251,113,133,0.08)] px-1.5 py-0.5 text-[10.5px]" style={{ color: "var(--r-crit)" }}>{RISK_LABELS[cat] ?? cat} {n}</span>
              )) : <span className="risk-mono text-[10.5px]" style={{ color: "var(--r-faint)" }}>감지된 리스크 어휘 없음</span>}
            </div>
          </div>

          {/* keywords + alerts */}
          <div className="rounded-xl border border-[var(--r-line)] p-4">
            <div className="risk-label mb-2.5">키워드</div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {keywords.slice(0, 16).map((k) => (
                <span key={k.word} className="risk-mono rounded border border-[var(--r-line)] px-1.5 py-0.5 text-[10.5px]" style={{ color: isRiskWord(k.word) ? "var(--r-crit)" : "var(--r-muted)" }}>
                  {k.word} <span style={{ color: "var(--r-faint)" }}>{k.count}</span>
                </span>
              ))}
              {keywords.length === 0 && <span className="risk-mono text-[10.5px]" style={{ color: "var(--r-faint)" }}>—</span>}
            </div>
            <div className="risk-label mb-2.5">알림 이력</div>
            {alerts.length === 0 ? (
              <p className="text-[12px]" style={{ color: "var(--r-faint)" }}>이 멤버에 대한 알림이 없어요</p>
            ) : (
              <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto pr-1">
                {alerts.map((a, i) => {
                  const sev = SEVERITY_META[a.severity] ?? SEVERITY_META.info;
                  return (
                    <li key={`${a.ts}-${i}`} className="flex items-baseline gap-2 py-1">
                      <span className="risk-mono shrink-0 text-[10px]" style={{ color: sev.color }}>{sev.glyph}</span>
                      <span className="min-w-0 flex-1 text-[12px] leading-snug">{a.message}</span>
                      <span className="risk-mono shrink-0 text-[10px]" style={{ color: "var(--r-faint)" }}>{ago(a.ts, now)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function RiskView() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  const groupTrend = useMemo(() => data?.members.all ?? [], [data]);
  const snapshotRuns = useMemo(
    () => new Set(groupTrend.map((s) => s.ts)).size,
    [groupTrend],
  );
  const summary = useMemo(
    () =>
      data
        ? buildSummary(data.members, data.alerts, data.latestTs, snapshotRuns)
        : null,
    [data, snapshotRuns],
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

        {/* ── Row 1: 아이브 카드 + Executive Summary ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MemberTile
            member="all"
            trend={d.members.all ?? []}
            alerts={d.alerts}
            latestTs={d.latestTs}
            index={0}
            onOpen={setSelected}
          />
          <div className="sm:col-span-1 xl:col-span-2">
            {summary && <ExecPanel summary={summary} />}
          </div>
        </div>

        {/* ── Member threat board (from row 2) ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MEMBERS.map((m, i) => (
            <MemberTile
              key={m.key}
              member={m.key}
              trend={d.members[m.key] ?? []}
              alerts={d.alerts}
              latestTs={d.latestTs}
              index={i + 1}
              onOpen={setSelected}
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

          {/* ── Source matrix ── */}
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
          </section>
        </div>

        {/* ── Chatter cloud (interactive) ── */}
        <ChatterCloud members={d.members} sources={d.sources} />

        <p className="risk-in px-1 pb-2 text-[10.5px] leading-relaxed" style={{ color: "var(--r-faint)", animationDelay: "680ms" }}>
          유튜브(공식+외부)·뉴스·DC·인스타를 2시간 주기로 수집해 각 채널의 평시 베이스라인 대비
          이탈(언급 급증·부정 여론 전환·리스크 어휘·신규 키워드)만 신호로 승격합니다. 어휘 사전 기반
          추정치이며 판단의 보조 자료로만 사용하세요.
        </p>
      </div>

      {selected && (
        <DetailModal
          member={selected}
          fallbackTrend={d.members[selected] ?? []}
          fallbackAlerts={d.alerts}
          latestTs={d.latestTs}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
