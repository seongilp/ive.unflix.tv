import { describe, expect, it } from "vitest";
import { stripHtml, truncate } from "./html";

describe("stripHtml", () => {
  it("removes tags and decodes common entities", () => {
    expect(stripHtml("<b>리센느</b> &amp; &quot;원이&quot;")).toBe('리센느 & "원이"');
  });
  it("collapses to trimmed text", () => {
    expect(stripHtml("  <p>hi</p>  ")).toBe("hi");
  });
  it("decodes &amp; last so double-encoded entities stay literal", () => {
    expect(stripHtml("&amp;quot;")).toBe("&quot;");
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
