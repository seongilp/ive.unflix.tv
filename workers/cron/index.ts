// Standalone cron worker: keeps the risk pipeline running with zero visitors.
// Deliberately dumb — all logic lives in the main app's guarded endpoints;
// this worker only drives them on a schedule.

interface Env {
  APP_BASE: string; // e.g. https://ive.unflix.tv
  OPS_KEY: string; // same value as the app's FEED_WARM_KEY secret
}

const COLLECT_CRON = "7 */2 * * *"; // every 2h — snapshot cadence
const DISCOVER_CRON = "23 3,15 * * *"; // 2×/day — search.list is quota-heavy

const worker = {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(event.cron, env));
  },
};
export default worker;

async function run(cron: string, env: Env): Promise<void> {
  const base = env.APP_BASE.replace(/\/$/, "");

  if (cron === DISCOVER_CRON) {
    await fetch(`${base}/api/risk/discover?key=${env.OPS_KEY}`);
    return;
  }

  if (cron === COLLECT_CRON) {
    // Seed the channel/video cache, then drive collect batches to completion.
    await fetch(`${base}/api/channel?handle=UC-Fnix71vRP64WXeo0ikd0Q`).catch(() => {});
    const run = String(Date.now());
    let start = 0;
    for (let i = 0; i < 40; i++) {
      const res = await fetch(
        `${base}/api/risk/collect?key=${env.OPS_KEY}&run=${run}&start=${start}`,
      );
      if (!res.ok) return;
      const j = (await res.json()) as { done?: boolean; next?: number };
      if (j.done || typeof j.next !== "number") return;
      start = j.next;
    }
  }
}
