import { describe, expect, it } from "vitest";
import { detectRiskCategories } from "./terms";
import { evaluateAlerts, negShare, type BaselineStat } from "./rules";
import { accumulate, finalizeRows, likeWeight, newAgg } from "./aggregate";

describe("detectRiskCategories", () => {
  it("detects categories once per text", () => {
    const cats = detectRiskCategories("학폭 의혹 폭로에 소속사 법적 대응 예고");
    expect(cats).toContain("bullying");
    expect(cats).toContain("response");
  });

  it("returns [] for benign fan text", () => {
    expect(detectRiskCategories("오늘 무대 진짜 예뻤다")).toEqual([]);
  });
});

function base(over: Partial<BaselineStat> = {}): BaselineStat {
  return {
    samples: 10,
    avgMentions: 100,
    avgNegShare: 0.1,
    avgRisk: {},
    knownKeywords: new Set(["직캠", "무대"]),
    ...over,
  };
}

function stat(over: Partial<Parameters<typeof evaluateAlerts>[2]> = {}) {
  return {
    mentions: 100,
    positive: 70,
    neutral: 20,
    negative: 10,
    negWeighted: 0.1,
    risk: {},
    keywords: [],
    ...over,
  };
}

describe("evaluateAlerts", () => {
  it("stays silent without enough baseline samples", () => {
    expect(evaluateAlerts("all", "all", stat({ mentions: 900 }), base({ samples: 2 }))).toEqual([]);
    expect(evaluateAlerts("all", "all", stat({ mentions: 900 }), null)).toEqual([]);
  });

  it("fires volume_spike at 3x, critical at 5x", () => {
    const warn = evaluateAlerts("all", "news", stat({ mentions: 320 }), base());
    expect(warn.find((a) => a.kind === "volume_spike")?.severity).toBe("warning");
    const crit = evaluateAlerts("all", "news", stat({ mentions: 550 }), base());
    expect(crit.find((a) => a.kind === "volume_spike")?.severity).toBe("critical");
  });

  it("fires sentiment_shift only vs the bucket's own baseline", () => {
    // 30% negative vs 10% baseline → +20pp shift
    const shifted = evaluateAlerts(
      "wonyoung", "youtube",
      stat({ positive: 50, neutral: 20, negative: 30 }),
      base(),
    );
    expect(shifted.find((a) => a.kind === "sentiment_shift")?.severity).toBe("warning");
    // Same 30% negative but the bucket is ALWAYS 30% negative → silent
    const normal = evaluateAlerts(
      "wonyoung", "news",
      stat({ positive: 50, neutral: 20, negative: 30 }),
      base({ avgNegShare: 0.3 }),
    );
    expect(normal.find((a) => a.kind === "sentiment_shift")).toBeUndefined();
  });

  it("fires new_keyword for unseen dominant words only", () => {
    const alerts = evaluateAlerts(
      "all", "all",
      stat({ keywords: [{ word: "직캠", count: 50 }, { word: "불참", count: 12 }] }),
      base(),
    );
    const fresh = alerts.filter((a) => a.kind === "new_keyword");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].message).toContain("불참");
  });

  it("fires risk_category surge", () => {
    const alerts = evaluateAlerts(
      "all", "dc",
      stat({ risk: { legal: 7 } }),
      base(),
    );
    expect(alerts.find((a) => a.kind === "risk_category")?.message).toContain("법적");
  });
});

describe("aggregate", () => {
  it("weights negativity by likes and buckets per member×source", () => {
    const agg = newAgg(1);
    accumulate(agg, { text: "유진이 별로다 실망", likeCount: 99, origin: "youtube" });
    accumulate(agg, { text: "유진이 최고 예쁘다", likeCount: 0, origin: "youtube" });
    const rows = finalizeRows(agg);
    const yujin = rows.find((r) => r.member === "yujin" && r.source === "youtube")!;
    expect(yujin.mentions).toBe(2);
    expect(yujin.negative).toBe(1);
    // raw share 50%, but the negative one carries ~3x weight
    expect(yujin.negWeighted).toBeGreaterThan(0.6);
    expect(rows.find((r) => r.member === "all" && r.source === "all")!.mentions).toBe(2);
  });

  it("likeWeight grows logarithmically", () => {
    expect(likeWeight(0)).toBe(1);
    expect(likeWeight(9)).toBe(2);
    expect(likeWeight(999)).toBe(4);
  });
});
