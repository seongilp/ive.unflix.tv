import { NextResponse } from "next/server";
import { riskDb } from "@/lib/risk/db";
import { MEMBERS } from "@/lib/analysis/members";

const TREND_POINTS = 60;

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

const VALID = new Set(["all", ...MEMBERS.map((m) => m.key)]);

// GET /api/risk/member?key=yujin — full detail for one member:
// the source='all' trend (charts) + latest per-source breakdown +
// latest keywords/risk + the member's alert history.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") ?? "";
  if (!VALID.has(key)) {
    return NextResponse.json({ error: "unknown member" }, { status: 400 });
  }
  const db = riskDb();
  if (!db) return NextResponse.json({ error: "D1 unavailable" }, { status: 503 });

  const { results: trendRows = [] } = await db
    .prepare(
      `SELECT * FROM snapshots WHERE member = ? AND source = 'all' ORDER BY ts DESC LIMIT ?`,
    )
    .bind(key, TREND_POINTS)
    .all<SnapshotRowRaw>();

  const latestTs = trendRows[0]?.ts ?? 0;
  const { results: sourceRows = [] } = await db
    .prepare(`SELECT * FROM snapshots WHERE member = ? AND ts = ? AND source != 'all'`)
    .bind(key, latestTs)
    .all<SnapshotRowRaw>();

  const { results: alertRows = [] } = await db
    .prepare(
      `SELECT ts, member, source, kind, severity, message FROM alerts WHERE member = ? ORDER BY ts DESC, id DESC LIMIT 30`,
    )
    .bind(key)
    .all<{ ts: number; member: string; source: string; kind: string; severity: string; message: string }>();

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

  return NextResponse.json(
    {
      member: key,
      latestTs,
      trend: trendRows.map(parse).reverse(), // oldest → newest
      sources: sourceRows.map(parse),
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
