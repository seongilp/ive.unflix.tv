import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IG_USERNAMES, IG_STATE_KV_KEY } from "../config";

// Map-backed fake of the KV subset instagram.ts uses.
function fakeKv(store: Map<string, string>) {
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

const store = new Map<string, string>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { SHORTS_CACHE: fakeKv(store) } }),
}));

import { fetchItems } from "./instagram";

const cursorKey = `${IG_STATE_KV_KEY}:cursor`;
const accountKey = (u: string) => `${IG_STATE_KV_KEY}:u:${u}`;

function profileJson(username: string, postId: string) {
  return {
    data: {
      user: {
        edge_owner_to_timeline_media: {
          edges: [
            {
              node: {
                id: postId,
                shortcode: `sc_${postId}`,
                taken_at_timestamp: 1780000000,
                edge_media_to_caption: {
                  edges: [{ node: { text: `${username}의 게시물` } }],
                },
              },
            },
          ],
        },
      },
    },
  };
}

describe("instagram round-robin rotation (per-account KV keys)", () => {
  const requested: string[] = [];

  beforeEach(() => {
    store.clear();
    requested.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const username = new URL(String(url)).searchParams.get("username")!;
        requested.push(username);
        return {
          ok: true,
          json: async () => profileJson(username, `post_${username}`),
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches exactly one account per refresh and accumulates", async () => {
    const round1 = await fetchItems();
    expect(requested).toEqual([IG_USERNAMES[0]]);
    expect(round1.map((i) => i.author)).toEqual([IG_USERNAMES[0]]);

    const round2 = await fetchItems();
    expect(requested).toEqual([IG_USERNAMES[0], IG_USERNAMES[1]]);
    expect(new Set(round2.map((i) => i.author))).toEqual(
      new Set([IG_USERNAMES[0], IG_USERNAMES[1]]),
    );
    expect(store.get(cursorKey)).toBe("2");
  });

  it("writes each account under its own key (stale colo can't wipe others)", async () => {
    await fetchItems();
    await fetchItems();
    expect(store.has(accountKey(IG_USERNAMES[0]))).toBe(true);
    expect(store.has(accountKey(IG_USERNAMES[1]))).toBe(true);
    // a cursor regression (eventual-consistency jitter) refetches an account
    // but never destroys the other keys
    store.set(cursorKey, "0");
    const items = await fetchItems();
    expect(new Set(items.map((i) => i.author))).toEqual(
      new Set([IG_USERNAMES[0], IG_USERNAMES[1]]),
    );
  });

  it("keeps an account's previous items when its fetch is blocked", async () => {
    await fetchItems(); // round 1: account[0] ok
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "fail" }), // rate-limited shape → no edges
      })),
    );
    const round2 = await fetchItems(); // round 2: account[1] blocked
    expect(round2.map((i) => i.author)).toEqual([IG_USERNAMES[0]]);
    // cursor still advances so one dead account can't stall the rotation
    expect(store.get(cursorKey)).toBe("2");
  });

  it("wraps the cursor past the last account", async () => {
    for (let i = 0; i < IG_USERNAMES.length; i++) await fetchItems();
    expect(store.get(cursorKey)).toBe("0");
    const all = await fetchItems();
    expect(new Set(all.map((i) => i.author)).size).toBe(IG_USERNAMES.length);
  });
});
