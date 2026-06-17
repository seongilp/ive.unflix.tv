import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFeed, mergeFeedItems } from "./aggregate";
import type { FeedItem } from "./types";
import * as naver from "./sources/naver";
import * as dc from "./sources/dc";
import * as instagram from "./sources/instagram";

vi.mock("./sources/naver");
vi.mock("./sources/dc");
vi.mock("./sources/instagram");

const item = (id: string, publishedAt: number): FeedItem => ({
  id,
  source: "naver",
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
});

describe("collectFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
