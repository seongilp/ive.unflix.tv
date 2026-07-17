import { describe, expect, it } from "vitest";
import { stripHtml, truncate } from "./html";

describe("stripHtml", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtml("<b>아이브</b> &amp; &quot;원영&quot;")).toBe('아이브 & "원영"');
  });
  it("collapses to trimmed text", () => {
    expect(stripHtml("  <p>hi</p>  ")).toBe("hi");
  });
  it("decodes &amp; last so double-encoded entities stay literal", () => {
    expect(stripHtml("&amp;quot;")).toBe("&quot;");
  });
  it("decodes hex apostrophe entities (Nate Pann)", () => {
    expect(stripHtml("아이브 &#x27;ATTITUDE&#x27; 어때")).toBe("아이브 'ATTITUDE' 어때");
    expect(stripHtml("&#39;a&#x27;b&#39;")).toBe("'a'b'");
  });
});

describe("truncate", () => {
  it("leaves short strings unchanged", () => {
    expect(truncate("abc", 10)).toBe("abc");
  });
  it("leaves a string exactly at the limit unchanged", () => {
    expect(truncate("abcd", 4)).toBe("abcd");
  });
  it("adds an ellipsis when over the limit", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
  });
});
