import { describe, expect, it } from "vitest";
import { normalizeIgWebProfile } from "./instagram";

const profile = {
  data: {
    user: {
      edge_owner_to_timeline_media: {
        edges: [
          {
            node: {
              id: "3922776647338051564",
              shortcode: "DZwgJO1yEfs",
              is_video: false,
              display_url: "https://cdn.example.com/a.jpg",
              thumbnail_src: "https://cdn.example.com/t.jpg",
              taken_at_timestamp: 1781859605,
              edge_media_to_caption: {
                edges: [{ node: { text: "RESCENE 🎀\n2026.07.08 6PM" } }],
              },
            },
          },
        ],
      },
    },
  },
};

describe("normalizeIgWebProfile", () => {
  it("maps a timeline node to a FeedItem", () => {
    const [item] = normalizeIgWebProfile(profile, "rescene_official");
    expect(item.id).toBe("instagram:3922776647338051564");
    expect(item.source).toBe("instagram");
    expect(item.author).toBe("rescene_official");
    expect(item.title).toBe("RESCENE 🎀");
    expect(item.snippet).toBe("RESCENE 🎀 2026.07.08 6PM");
    expect(item.url).toBe("https://www.instagram.com/p/DZwgJO1yEfs/");
    expect(item.thumbnail).toBe("https://cdn.example.com/a.jpg");
    // taken_at_timestamp is in seconds → epoch ms.
    expect(item.publishedAt).toBe(1781859605 * 1000);
  });

  it("falls back to (사진) when a post has no caption", () => {
    const node = profile.data.user.edge_owner_to_timeline_media.edges[0].node;
    const noCaption = {
      data: {
        user: {
          edge_owner_to_timeline_media: {
            edges: [{ node: { ...node, edge_media_to_caption: { edges: [] } } }],
          },
        },
      },
    };
    const [item] = normalizeIgWebProfile(noCaption, "rescene_official");
    expect(item.title).toBe("(사진)");
  });

  it("returns [] when the profile has no timeline media", () => {
    expect(normalizeIgWebProfile({ data: { user: {} } }, "rescene_official")).toEqual([]);
    expect(normalizeIgWebProfile({}, "rescene_official")).toEqual([]);
  });
});
