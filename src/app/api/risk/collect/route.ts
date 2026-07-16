import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { listComments, type ShortsCache } from "@/lib/youtube";
import { getCachedFeed } from "@/lib/feed/cache";
import { memberKeyForIgUsername } from "@/lib/analysis/members";
import {
  accumulate, finalizeRows, newAgg, pruneAgg, type RiskAgg,
} from "@/lib/risk/aggregate";
import { evaluateAlerts, type RiskAlert } from "@/lib/risk/rules";
import { insertAlerts, insertSnapshots, loadBaselines, riskDb } from "@/lib/risk/db";

const DEFAULT_CHANNEL = "UC-Fnix71vRP64WXeo0ikd0Q";
// Videos per call — each costs ~2-3 subrequests (KV read / YT fetch / KV write).
const BATCH = 10;
const AGG_TTL_SECONDS = 60 * 60; // an abandoned run's partial state self-cleans
const BASELINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const EXT_VIDEOS_KV_KEY = "risk:extvids:v1";

function appCache(): ShortsCache | undefined {
  try {
    return getCloudflareContext().env.SHORTS_CACHE as ShortsCache | undefined;
  } catch {
    return undefined;
  }
}

interface ChannelCacheEntry {
  data?: { videos?: Array<{ id?: string }> };
}

async function videoIds(kv: ShortsCache): Promise<{ ids: string[]; ext: Set<string> }> {
  let ids: string[] = [];
  try {
    const raw = await kv.get(`channel:v2:${DEFAULT_CHANNEL.toLowerCase()}`);
    const entry = raw ? (JSON.parse(raw) as ChannelCacheEntry) : undefined;
    ids = (entry?.data?.videos ?? [])
      .map((v) => v?.id)
      .filter((id): id is string => Boolean(id));
  } catch { /* empty channel cache handled by caller */ }

  const ext = new Set<string>();
  try {
    const raw = await kv.get(EXT_VIDEOS_KV_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    for (const id of list) {
      if (!ids.includes(id)) {
        ids.push(id);
        ext.add(id);
      }
    }
  } catch { /* no external list yet */ }
  return { ids, ext };
}

// GET /api/risk/collect?key=…&run=<id>&start=N
// One batch of the risk pass: warms the comment cache for `BATCH` videos AND
// folds their comments into the run's aggregate. On the last batch the
// aggregate becomes D1 snapshot rows, alert rules run against the trailing
// baseline, and fired alerts go to the alerts table (+ optional webhook).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const expected = process.env.FEED_WARM_KEY;
  if (!expected || searchParams.get("key") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const run = searchParams.get("run") ?? "manual";
  const start = Math.max(0, Number(searchParams.get("start") ?? 0) || 0);

  const kv = appCache();
  const db = riskDb();
  if (!kv || !db) {
    return NextResponse.json({ error: "KV/D1 unavailable" }, { status: 503 });
  }

  const aggKey = `risk:agg:${run}`;
  let agg: RiskAgg;
  if (start === 0) {
    agg = newAgg(Date.now());
    // Feed items (news/DC/instagram) are one cached read — fold them in up front.
    try {
      const items = await getCachedFeed();
      for (const it of items) {
        const memberKey =
          it.source === "instagram" ? memberKeyForIgUsername(it.author) : undefined;
        accumulate(agg, {
          text: `${it.title} ${it.snippet}`.trim(),
          likeCount: 0,
          origin: it.source === "naver" || it.source === "daum" ? "news" : it.source,
          members: memberKey ? [memberKey] : undefined,
        });
      }
    } catch { /* feed unavailable → comments-only snapshot */ }
  } else {
    try {
      const raw = await kv.get(aggKey);
      agg = raw ? (JSON.parse(raw) as RiskAgg) : newAgg(Date.now());
    } catch {
      agg = newAgg(Date.now());
    }
  }

  const { ids, ext } = await videoIds(kv);
  if (ids.length === 0) {
    return NextResponse.json(
      { error: "channel cache empty — GET /api/channel first" },
      { status: 409 },
    );
  }

  for (const id of ids.slice(start, start + BATCH)) {
    try {
      const page = await listComments(id, undefined, "relevance", kv);
      const origin = ext.has(id) ? "yt_ext" : "youtube";
      for (const c of page.comments) {
        accumulate(agg, { text: c.text, likeCount: c.likeCount, origin });
      }
    } catch { /* comments disabled etc. — skip video */ }
  }

  const next = Math.min(ids.length, start + BATCH);
  if (next < ids.length) {
    pruneAgg(agg);
    await kv.put(aggKey, JSON.stringify(agg), { expirationTtl: AGG_TTL_SECONDS });
    return NextResponse.json({ run, start, next, total: ids.length, done: false });
  }

  // ── Final batch: snapshot + alerting ──
  const rows = finalizeRows(agg);
  const baselines = await loadBaselines(db, agg.ts, BASELINE_WINDOW_MS);
  const fired: Array<RiskAlert & { member: string; source: string }> = [];
  for (const row of rows) {
    const base = baselines.get(`${row.member}|${row.source}`) ?? null;
    const alerts = evaluateAlerts(row.member, row.source, {
      mentions: row.mentions,
      positive: row.positive,
      neutral: row.neutral,
      negative: row.negative,
      negWeighted: row.negWeighted,
      risk: row.risk,
      keywords: row.keywords,
    }, base);
    for (const a of alerts) fired.push({ ...a, member: row.member, source: row.source });
  }

  await insertSnapshots(db, rows);
  await insertAlerts(db, agg.ts, fired);

  // Optional outbound notification (Discord-compatible JSON webhook).
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (webhook && fired.some((a) => a.severity !== "info")) {
    const lines = fired
      .filter((a) => a.severity !== "info")
      .slice(0, 8)
      .map((a) => `${a.severity === "critical" ? "🚨" : "⚠️"} ${a.message}`);
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `IVE 리스크 알림\n${lines.join("\n")}` }),
      });
    } catch { /* alerting must never fail the snapshot */ }
  }

  try {
    await kv.put(aggKey, "", { expirationTtl: 60 });
  } catch { /* stale agg is TTL-bound anyway */ }

  return NextResponse.json({
    run,
    start,
    next,
    total: ids.length,
    done: true,
    snapshotRows: rows.length,
    alerts: fired.length,
  });
}
