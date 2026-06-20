import { describe, expect, it } from "vitest";
import { normalizeDaum } from "./daum";

const sample = [
  {
    title: "<b>리센느</b> 신곡 발매",
    contents: "그룹 <b>리센느</b>가 &#39;Pretty Girl&#39; 발매 &amp; 활동",
    url: "https://news.example.com/a/1",
    datetime: "2026-06-12T09:00:00.000+09:00",
  },
];

describe("normalizeDaum", () => {
  it("maps a Daum web document to a FeedItem", () => {
    const [item] = normalizeDaum(sample);
    expect(item.id).toBe("daum:https://news.example.com/a/1");
    expect(item.source).toBe("daum");
    expect(item.author).toBe("news.example.com");
    expect(item.title).toBe("리센느 신곡 발매");
    expect(item.snippet).toBe("그룹 리센느가 'Pretty Girl' 발매 & 활동");
    expect(item.url).toBe("https://news.example.com/a/1");
    expect(item.publishedAt).toBe(Date.parse("2026-06-12T09:00:00.000+09:00"));
  });
});
