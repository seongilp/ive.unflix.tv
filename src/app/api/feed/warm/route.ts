import { NextResponse } from "next/server";
import { IG_USERNAMES } from "@/lib/feed/config";
import { warmAccount, accountStatus } from "@/lib/feed/sources/instagram";

// GET /api/feed/warm — guarded ops endpoint: fetches the first Instagram
// account that has no stored items yet and persists it. Lets an operator
// (re)fill the per-account cache without waiting a full rotation cycle.
// Requires the FEED_WARM_KEY secret in the `key` query param.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const expected = process.env.FEED_WARM_KEY;
  if (!expected || key !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const status = await accountStatus();
  const target =
    searchParams.get("u") ?? IG_USERNAMES.find((u) => (status[u] ?? 0) === 0);
  if (!target || !IG_USERNAMES.includes(target)) {
    return NextResponse.json({ done: true, status });
  }

  try {
    const count = await warmAccount(target);
    status[target] = count > 0 ? count : status[target];
    return NextResponse.json({ warmed: target, count, status });
  } catch {
    return NextResponse.json({ warmed: target, count: 0, status });
  }
}
