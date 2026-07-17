import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFeed, mergeFeedItems } from "./aggregate";
import type { FeedItem } from "./types";
import * as naver from "./sources/naver";
import * as daum from "./sources/daum";
import * as dc from "./sources/dc";
import * as instagram from "./sources/instagram";
import * as pann from "./sources/pann";

vi.mock("./sources/naver");
vi.mock("./sources/daum");
vi.mock("./sources/dc");
vi.mock("./sources/instagram");
vi.mock("./sources/pann");

// Default every mocked adapter to empty so a test only wires the sources it
// cares about (and none hit the network). Reset first so the default sticks.
function resetAdapters() {
  vi.clearAllMocks();
  for (const a of [naver, daum, dc, instagram, pann]) {
    vi.mocked(a.fetchItems).mockResolvedValue([]);
  }
}

const item = (
  id: string,
  publishedAt: number,
  source: FeedItem["source"] = "naver",
): FeedItem => ({
  id,
  source,
  author: "a",
  title: "t",
  snippet: "s",
  url: "u",
  publishedAt,
});

describe("mergeFeedItems", () => {
  it("merges lists newest-first", () => {
    const merged = mergeFeedItems([[item("a", 1)], [item("b", 3), item("c", 2)]]);
    expect(merged.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const merged = mergeFeedItems([[item("a", 1)], [item("a", 99)]]);
    expect(merged).toHaveLength(1);
    expect(merged[0].publishedAt).toBe(1);
  });

  it("caps to the limit", () => {
    const many = Array.from({ length: 5 }, (_, i) => item(`x${i}`, i));
    expect(mergeFeedItems([many], 3)).toHaveLength(3);
  });

  it("caps per source, so news volume can't crowd out old Instagram posts", () => {
    // 5 fresh news items vs 2 much older instagram posts, per-source cap 3.
    const news = Array.from({ length: 5 }, (_, i) => item(`n${i}`, 100 + i));
    const ig = [item("i1", 1, "instagram"), item("i2", 2, "instagram")];
    const merged = mergeFeedItems([news, ig], 10, 3);
    expect(merged.filter((i) => i.source === "naver")).toHaveLength(3);
    expect(merged.filter((i) => i.source === "instagram")).toHaveLength(2);
    // still globally newest-first
    expect(merged[0].id).toBe("n4");
    expect(merged[merged.length - 1].id).toBe("i1");
  });
});

describe("collectFeed", () => {
  beforeEach(resetAdapters);

  it("isolates a failing adapter — a rejected source contributes nothing and never aborts the merge", async () => {
    vi.mocked(naver.fetchItems).mockResolvedValue([item("n1", 3), item("n2", 1)]);
    vi.mocked(dc.fetchItems).mockRejectedValue(new Error("DC blocked"));
    vi.mocked(instagram.fetchItems).mockResolvedValue([item("i1", 2)]);

    const merged = await collectFeed();

    expect(merged.map((i) => i.id)).toEqual(["n1", "i1", "n2"]);
  });

  it("resolves to [] when every adapter returns empty", async () => {
    vi.mocked(naver.fetchItems).mockResolvedValue([]);
    vi.mocked(dc.fetchItems).mockResolvedValue([]);
    vi.mocked(instagram.fetchItems).mockResolvedValue([]);

    expect(await collectFeed()).toEqual([]);
  });
});
