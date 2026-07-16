import { NextResponse } from "next/server";
import { riskDb } from "@/lib/risk/db";
import { MEMBERS } from "@/lib/analysis/members";

const TREND_POINTS = 36; // ≈3 days at a 2h cadence
const ALERT_LIMIT = 40;

interface SnapshotRowRaw {
  ts: number;
  member: string;
  source: string;
  mentions: number;
  positive: number;
  neutral: number;
  negative: number;
  neg_weighted: number;
  risk_json: string;
  keywords_json: string;
}

interface AlertRowRaw {
  ts: number;
  member: string;
  source: string;
  kind: string;
  severity: string;
  message: string;
}

// GET /api/risk/summary — read-only dashboard payload:
// per-member latest stats + mention/negativity trends, per-source latest,
// and the recent alert feed.
export async function GET() {
  const db = riskDb();
  if (!db) return NextResponse.json({ error: "D1 unavailable" }, { status: 503 });

  // Last N runs' worth of member×'all' rows (trends), newest first.
  const { results: memberRows = [] } = await db
    .prepare(
      `SELECT * FROM snapshots
        WHERE source = 'all'
        ORDER BY ts DESC
        LIMIT ?`,
    )
    .bind(TREND_POINTS * (MEMBERS.length + 1))
    .all<SnapshotRowRaw>();

  // Latest run's per-source rows for the source matrix.
  const latestTs = memberRows[0]?.ts ?? 0;
  const { results: sourceRows = [] } = await db
    .prepare(`SELECT * FROM snapshots WHERE ts = ? AND member = 'all'`)
    .bind(latestTs)
    .all<SnapshotRowRaw>();

  const { results: alertRows = [] } = await db
    .prepare(`SELECT ts, member, source, kind, severity, message FROM alerts ORDER BY ts DESC, id DESC LIMIT ?`)
    .bind(ALERT_LIMIT)
    .all<AlertRowRaw>();

  const parse = (r: SnapshotRowRaw) => ({
    ts: r.ts,
    member: r.member,
    source: r.source,
    mentions: r.mentions,
    positive: r.positive,
    neutral: r.neutral,
    negative: r.negative,
    negWeighted: r.neg_weighted,
    risk: safeJson<Record<string, number>>(r.risk_json, {}),
    keywords: safeJson<{ word: string; count: number }[]>(r.keywords_json, []),
  });

  const members: Record<string, ReturnType<typeof parse>[]> = {};
  for (const r of memberRows) {
    (members[r.member] ??= []).push(parse(r));
  }
  // oldest → newest for charting
  for (const list of Object.values(members)) list.reverse();

  return NextResponse.json(
    {
      generatedAt: Date.now(),
      latestTs,
      members,
      sources: sourceRows.filter((r) => r.source !== "all").map(parse),
      alerts: alertRows,
    },
    { headers: { "Cache-Control": "public, s-maxage=60" } },
  );
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
