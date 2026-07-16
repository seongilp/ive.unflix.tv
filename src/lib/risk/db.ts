// D1 access for the risk pipeline. Typed minimally so we don't depend on
// generated bindings.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SnapshotRow } from "./aggregate";
import type { BaselineStat, RiskAlert } from "./rules";

interface D1Result<T = unknown> {
  results?: T[];
}
interface D1Stmt {
  bind(...args: unknown[]): D1Stmt;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface RiskDb {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<unknown>;
}

export function riskDb(): RiskDb | undefined {
  try {
    return (getCloudflareContext().env as { RISK_DB?: RiskDb }).RISK_DB;
  } catch {
    return undefined;
  }
}

const INSERT_SNAPSHOT =
  `INSERT INTO snapshots (ts, member, source, mentions, positive, neutral, negative, neg_weighted, risk_json, keywords_json)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export async function insertSnapshots(db: RiskDb, rows: SnapshotRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 20) {
    const chunk = rows.slice(i, i + 20).map((r) =>
      db.prepare(INSERT_SNAPSHOT).bind(
        r.ts, r.member, r.source, r.mentions, r.positive, r.neutral,
        r.negative, r.negWeighted, JSON.stringify(r.risk), JSON.stringify(r.keywords),
      ),
    );
    await db.batch(chunk);
  }
}

interface BaselineRowRaw {
  member: string;
  source: string;
  samples: number;
  avg_mentions: number;
  avg_neg_share: number;
}

// Baselines for every (member, source) in one query: trailing window,
// excluding the current run's ts.
export async function loadBaselines(
  db: RiskDb,
  beforeTs: number,
  windowMs: number,
): Promise<Map<string, BaselineStat>> {
  const since = beforeTs - windowMs;
  const { results = [] } = await db
    .prepare(
      `SELECT member, source, COUNT(*) AS samples,
              AVG(mentions) AS avg_mentions,
              AVG(CASE WHEN (positive+neutral+negative)=0 THEN 0
                       ELSE CAST(negative AS REAL)/(positive+neutral+negative) END) AS avg_neg_share
         FROM snapshots WHERE ts >= ? AND ts < ?
        GROUP BY member, source`,
    )
    .bind(since, beforeTs)
    .all<BaselineRowRaw>();

  const map = new Map<string, BaselineStat>();
  for (const r of results) {
    map.set(`${r.member}|${r.source}`, {
      samples: r.samples,
      avgMentions: r.avg_mentions ?? 0,
      avgNegShare: r.avg_neg_share ?? 0,
      avgRisk: {},
      knownKeywords: new Set(),
    });
  }

  // Risk-category and keyword baselines ride on the stored JSON columns.
  const { results: jsonRows = [] } = await db
    .prepare(
      `SELECT member, source, risk_json, keywords_json
         FROM snapshots WHERE ts >= ? AND ts < ?`,
    )
    .bind(since, beforeTs)
    .all<{ member: string; source: string; risk_json: string; keywords_json: string }>();

  const riskSums = new Map<string, Record<string, number>>();
  for (const r of jsonRows) {
    const key = `${r.member}|${r.source}`;
    const base = map.get(key);
    if (!base) continue;
    try {
      const risk = JSON.parse(r.risk_json) as Record<string, number>;
      const sums = riskSums.get(key) ?? {};
      for (const [cat, n] of Object.entries(risk)) sums[cat] = (sums[cat] ?? 0) + n;
      riskSums.set(key, sums);
    } catch { /* skip corrupt row */ }
    try {
      const kws = JSON.parse(r.keywords_json) as { word: string }[];
      for (const k of kws) base.knownKeywords.add(k.word);
    } catch { /* skip corrupt row */ }
  }
  for (const [key, sums] of riskSums) {
    const base = map.get(key)!;
    for (const [cat, sum] of Object.entries(sums)) {
      base.avgRisk[cat] = sum / base.samples;
    }
  }
  return map;
}

export async function insertAlerts(
  db: RiskDb,
  ts: number,
  alerts: Array<RiskAlert & { member: string; source: string }>,
): Promise<void> {
  if (alerts.length === 0) return;
  const stmts = alerts.map((a) =>
    db
      .prepare(
        `INSERT INTO alerts (ts, member, source, kind, severity, message, value, baseline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(ts, a.member, a.source, a.kind, a.severity, a.message, a.value, a.baseline),
  );
  await db.batch(stmts);
}
