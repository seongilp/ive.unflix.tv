import { describe, expect, it } from "vitest";
import { mergeFeedItems } from "./aggregate";
import type { FeedItem } from "./types";

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
