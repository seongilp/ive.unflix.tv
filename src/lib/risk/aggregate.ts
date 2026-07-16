// Incremental risk aggregation. The collect route processes videos in small
// batches (Workers subrequest limits), so partial state lives in KV between
// calls and is finalized into D1 snapshot rows at the end of a run.

import { stripHtml } from "../feed/html";
import { detectMembers } from "../analysis/members";
import { scoreSentiment } from "../analysis/sentiment";
import { keywordTokens } from "../analysis/keywords";
import { ALIAS_EXCLUDE } from "../analysis/analyze";
import { detectRiskCategories } from "./terms";

export interface RiskUnit {
  text: string;
  likeCount: number;
  origin: string; // youtube | yt_ext | news | dc | instagram
  members?: string[]; // pre-attributed (member's own IG post)
}

// One (member × source) bucket. Short field names — this JSON round-trips
// through KV on every batch.
export interface Bucket {
  m: number; // mentions
  p: number; // positive
  u: number; // neutral
  n: number; // negative
  wn: number; // like-weight sum of negative units
  wt: number; // like-weight sum of all units
  risk: Record<string, number>;
  kw: Record<string, number>;
}

export interface RiskAgg {
  ts: number;
  stats: Record<string, Bucket>; // key: `${member}|${source}`
}

const KEYWORD_CAP = 300; // per-bucket keyword map size between batches
export const SNAPSHOT_KEYWORDS = 15; // keywords persisted per snapshot row

export function newAgg(ts: number): RiskAgg {
  return { ts, stats: {} };
}

function bucket(agg: RiskAgg, member: string, source: string): Bucket {
  const key = `${member}|${source}`;
  return (agg.stats[key] ??= {
    m: 0, p: 0, u: 0, n: 0, wn: 0, wt: 0, risk: {}, kw: {},
  });
}

// Like-weight: 1 for a plain unit, grows logarithmically with 공감 so one
// viral comment outweighs dozens of drive-bys without dwarfing everything.
export function likeWeight(likes: number): number {
  return 1 + Math.log10(1 + Math.max(0, likes));
}

export function accumulate(agg: RiskAgg, unit: RiskUnit): void {
  const text = stripHtml(unit.text);
  if (!text) return;
  const { label } = scoreSentiment(text);
  const riskCats = detectRiskCategories(text);
  const tokens = keywordTokens(text, ALIAS_EXCLUDE);
  const w = likeWeight(unit.likeCount);
  const members = new Set(["all", ...detectMembers(text), ...(unit.members ?? [])]);

  for (const member of members) {
    for (const source of [unit.origin, "all"]) {
      const b = bucket(agg, member, source);
      b.m++;
      if (label === "positive") b.p++;
      else if (label === "negative") b.n++;
      else b.u++;
      b.wt += w;
      if (label === "negative") b.wn += w;
      for (const cat of riskCats) b.risk[cat] = (b.risk[cat] ?? 0) + 1;
      for (const t of tokens) b.kw[t] = (b.kw[t] ?? 0) + 1;
    }
  }
}

// Trim keyword maps so the KV round-trip stays small.
export function pruneAgg(agg: RiskAgg): void {
  for (const b of Object.values(agg.stats)) {
    const entries = Object.entries(b.kw);
    if (entries.length <= KEYWORD_CAP) continue;
    entries.sort((a, z) => z[1] - a[1]);
    b.kw = Object.fromEntries(entries.slice(0, KEYWORD_CAP));
  }
}

export interface SnapshotRow {
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

export function finalizeRows(agg: RiskAgg): SnapshotRow[] {
  return Object.entries(agg.stats)
    .filter(([, b]) => b.m > 0)
    .map(([key, b]) => {
      const [member, source] = key.split("|");
      const keywords = Object.entries(b.kw)
        .map(([word, count]) => ({ word, count }))
        .sort((a, z) => z.count - a.count)
        .slice(0, SNAPSHOT_KEYWORDS);
      return {
        ts: agg.ts,
        member,
        source,
        mentions: b.m,
        positive: b.p,
        neutral: b.u,
        negative: b.n,
        negWeighted: b.wt === 0 ? 0 : b.wn / b.wt,
        risk: b.risk,
        keywords,
      };
    });
}
