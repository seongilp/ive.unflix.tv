// Pure alert-evaluation rules: current snapshot vs trailing baseline.
// Kept side-effect free so the thresholds are unit-testable.

import { RISK_LABELS } from "./terms";

export interface SnapshotStat {
  mentions: number;
  positive: number;
  neutral: number;
  negative: number;
  negWeighted: number; // like-weighted negative share 0..1
  risk: Record<string, number>;
  keywords: { word: string; count: number }[];
}

export interface BaselineStat {
  samples: number; // snapshots contributing to the baseline
  avgMentions: number;
  avgNegShare: number;
  avgRisk: Record<string, number>;
  knownKeywords: Set<string>; // union of recent top keywords
}

export interface RiskAlert {
  kind: "volume_spike" | "sentiment_shift" | "new_keyword" | "risk_category";
  severity: "info" | "warning" | "critical";
  message: string;
  value: number;
  baseline: number;
}

// A baseline needs at least this many prior snapshots to be trusted.
export const MIN_BASELINE_SAMPLES = 6;
// Ignore tiny buckets — 3 negative comments out of 5 is not a signal.
const MIN_MENTIONS = 20;

export function negShare(s: {
  positive: number;
  neutral: number;
  negative: number;
}): number {
  const total = s.positive + s.neutral + s.negative;
  return total === 0 ? 0 : s.negative / total;
}

export function evaluateAlerts(
  member: string,
  source: string,
  cur: SnapshotStat,
  base: BaselineStat | null,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const where = `${member === "all" ? "그룹 전체" : member}/${source}`;
  if (!base || base.samples < MIN_BASELINE_SAMPLES) return alerts;

  // 1) Volume spike — attention is the earliest signal, tone-agnostic.
  if (cur.mentions >= MIN_MENTIONS && base.avgMentions > 0) {
    const ratio = cur.mentions / base.avgMentions;
    if (ratio >= 3) {
      alerts.push({
        kind: "volume_spike",
        severity: ratio >= 5 ? "critical" : "warning",
        message: `[${where}] 언급량 급증: ${cur.mentions}건 (평시 ${base.avgMentions.toFixed(0)}건의 ${ratio.toFixed(1)}배)`,
        value: cur.mentions,
        baseline: base.avgMentions,
      });
    }
  }

  // 2) Sentiment shift — vs this bucket's OWN baseline (news is always
  //    negative; only a departure from its norm means anything).
  const ns = negShare(cur);
  if (cur.mentions >= MIN_MENTIONS && ns >= base.avgNegShare + 0.15) {
    alerts.push({
      kind: "sentiment_shift",
      severity: ns >= base.avgNegShare + 0.3 ? "critical" : "warning",
      message: `[${where}] 부정 여론 이탈: ${(ns * 100).toFixed(0)}% (평시 ${(base.avgNegShare * 100).toFixed(0)}%)`,
      value: ns,
      baseline: base.avgNegShare,
    });
  }

  // 3) Risk-category surge.
  for (const [cat, count] of Object.entries(cur.risk)) {
    const avg = base.avgRisk[cat] ?? 0;
    if (count >= 5 && (avg < 1 || count >= avg * 3)) {
      alerts.push({
        kind: "risk_category",
        severity: count >= 15 ? "critical" : "warning",
        message: `[${where}] ${RISK_LABELS[cat] ?? cat} 신호 ${count}건 (평시 ${avg.toFixed(1)}건)`,
        value: count,
        baseline: avg,
      });
    }
  }

  // 4) New dominant keyword — a word that was never in recent top lists
  //    suddenly ranking high is how a fresh issue announces itself.
  const fresh = cur.keywords
    .slice(0, 10)
    .filter((k) => k.count >= 10 && !base.knownKeywords.has(k.word))
    .slice(0, 3);
  for (const k of fresh) {
    alerts.push({
      kind: "new_keyword",
      severity: "info",
      message: `[${where}] 신규 키워드 급부상: "${k.word}" ${k.count}건`,
      value: k.count,
      baseline: 0,
    });
  }

  return alerts;
}
