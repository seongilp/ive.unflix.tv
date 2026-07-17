import { describe, expect, it } from "vitest";
import { normalizePann } from "./pann";

const html = `
<ul class="s_list">
  <li>
    <div class="thumb"><a href="/talk/375519014"><img src="x.jpg" /></a></div>
    <div class="tit">
      <h2><a href="/talk/375519014" class="subject">장원영 공항 <b>논란</b> 정리</a></h2>
      <span class="reple-num">(83)</span>
    </div>
    <div class="txt"><a href="/talk/375519014">본문 <b>미리보기</b> &amp; 텍스트</a></div>
    <div class="info">
      <span class="part"><a href="/talk/c20028">엔터톡</a></span>
      <span><a href="/search/talk" class="writer">ㅇㅇ</a></span>
      <span class="date">26.07.15 18:31</span>
    </div>
  </li>
  <li>
    <div class="tit"><h2><a href="/talk/pann/write" class="subject">글쓰기</a></h2></div>
  </li>
</ul>`;

describe("normalizePann", () => {
  it("maps a search-result row to a FeedItem", () => {
    const items = normalizePann(html);
    expect(items).toHaveLength(1); // the write-link row is skipped
    const [it] = items;
    expect(it.id).toBe("pann:375519014");
    expect(it.source).toBe("pann");
    expect(it.title).toBe("장원영 공항 논란 정리");
    expect(it.snippet).toBe("본문 미리보기 & 텍스트");
    expect(it.url).toBe("https://pann.nate.com/talk/375519014");
    expect(it.author).toBe("엔터톡"); // board category, not the nickname
  });

  it("parses the KST 2-digit-year date", () => {
    const [it] = normalizePann(html);
    // 2026-07-15 18:31 KST
    expect(it.publishedAt).toBe(Date.parse("2026-07-15T18:31:00+09:00"));
  });

  it("does not store the author nickname", () => {
    const json = JSON.stringify(normalizePann(html));
    expect(json).not.toContain("ㅇㅇ");
  });

  it("returns [] on empty markup", () => {
    expect(normalizePann("<html></html>")).toEqual([]);
  });
});
