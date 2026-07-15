import { describe, expect, it } from "vitest";
import { normalizeNaver } from "./naver";

const sample = [
  {
    title: "<b>아이브</b> 컴백 &quot;기대&quot;",
    originallink: "https://news.example.com/a/1",
    link: "https://n.news.naver.com/x",
    description: "그룹 <b>아이브</b>가 돌아온다 &amp; 외 소식",
    pubDate: "Mon, 16 Jun 2026 09:00:00 +0900",
  },
];

describe("normalizeNaver", () => {
  it("maps a news item to a FeedItem", () => {
    const [item] = normalizeNaver(sample);
    expect(item.source).toBe("naver");
    expect(item.id).toBe("naver:https://news.example.com/a/1");
    expect(item.title).toBe('아이브 컴백 "기대"');
    expect(item.snippet).toBe("그룹 아이브가 돌아온다 & 외 소식");
    expect(item.url).toBe("https://news.example.com/a/1");
    expect(item.author).toBe("news.example.com");
    expect(item.publishedAt).toBe(Date.parse("Mon, 16 Jun 2026 09:00:00 +0900"));
  });
});
