import { describe, expect, it } from "vitest";
import { normalizeInstagram } from "./instagram";

const sample = [
  {
    id: "178",
    caption: "리센느 첫 무대!\n많관부 🙏",
    media_type: "IMAGE",
    media_url: "https://cdn.example.com/a.jpg",
    permalink: "https://www.instagram.com/p/ABC/",
    timestamp: "2026-06-17T03:00:00+0000",
  },
];

describe("normalizeInstagram", () => {
  it("maps media to a FeedItem with the author shown verbatim (hashtag)", () => {
    const [item] = normalizeInstagram(sample, "#리센느");
    expect(item.id).toBe("instagram:178");
    expect(item.source).toBe("instagram");
    expect(item.author).toBe("#리센느");
    expect(item.title).toBe("리센느 첫 무대!");
    expect(item.snippet).toBe("리센느 첫 무대! 많관부 🙏");
    expect(item.url).toBe("https://www.instagram.com/p/ABC/");
    expect(item.thumbnail).toBe("https://cdn.example.com/a.jpg");
    expect(item.publishedAt).toBe(Date.parse("2026-06-17T03:00:00+0000"));
  });

  it("uses the official username verbatim as author (business discovery)", () => {
    const [item] = normalizeInstagram(sample, "rescene_official");
    expect(item.author).toBe("rescene_official");
  });

  it("falls back to (사진) when there is no caption", () => {
    const [item] = normalizeInstagram([{ ...sample[0], caption: undefined }], "RESCENE");
    expect(item.title).toBe("(사진)");
  });

  it("omits thumbnail for video media with no poster", () => {
    const [item] = normalizeInstagram(
      [{ ...sample[0], media_type: "VIDEO", media_url: undefined }],
      "#리센느",
    );
    expect(item.thumbnail).toBeUndefined();
  });

  it("uses thumbnail_url as the poster for video media", () => {
    const [item] = normalizeInstagram(
      [{ ...sample[0], media_type: "VIDEO", thumbnail_url: "https://cdn.example.com/poster.jpg" }],
      "rescene_official",
    );
    expect(item.thumbnail).toBe("https://cdn.example.com/poster.jpg");
  });
});
