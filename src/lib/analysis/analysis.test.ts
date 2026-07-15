import { describe, expect, it } from "vitest";
import { detectMembers, memberKeyForIgUsername, mentionsAlias } from "./members";
import { scoreSentiment } from "./sentiment";
import { extractKeywords } from "./keywords";
import { analyzeComments } from "./analyze";

describe("mentionsAlias", () => {
  it("matches an alias followed by a particle", () => {
    expect(mentionsAlias("유진이는 오늘도 예쁘다", "유진")).toBe(true);
    expect(mentionsAlias("레이가 최고야", "레이")).toBe(true);
  });

  it("rejects the alias embedded in another word", () => {
    expect(mentionsAlias("플레이리스트 최고", "레이")).toBe(false);
    expect(mentionsAlias("레이싱 경기", "레이")).toBe(false);
    expect(mentionsAlias("스타일리즈드", "리즈")).toBe(false);
  });

  it("matches at string boundaries", () => {
    expect(mentionsAlias("레이", "레이")).toBe(true);
    expect(mentionsAlias("최고다 안유진", "안유진")).toBe(true);
  });

  it("keeps scanning past a rejected occurrence", () => {
    expect(mentionsAlias("플레이 중에도 레이가 보인다", "레이")).toBe(true);
  });
});

describe("detectMembers", () => {
  it("finds multiple members in one comment (case-insensitive)", () => {
    const keys = detectMembers("Wonyoung 미모 미쳤고 이서도 귀엽다");
    expect(keys).toContain("wonyoung");
    expect(keys).toContain("leeseo");
    expect(keys).toHaveLength(2);
  });

  it("returns [] when nobody is mentioned", () => {
    expect(detectMembers("오늘 콘서트 너무 재밌었다")).toEqual([]);
  });
});

describe("scoreSentiment", () => {
  it("labels fan-slang positives", () => {
    expect(scoreSentiment("장원영 비주얼 미쳤다 진짜 예뻐").label).toBe("positive");
    expect(scoreSentiment("무대 찢었다 레전드 ❤").label).toBe("positive");
  });

  it("labels negatives", () => {
    expect(scoreSentiment("이번 곡은 별로다 실망했어").label).toBe("negative");
  });

  it("labels neutral when no cues or tied", () => {
    expect(scoreSentiment("3:24 안무 구간").label).toBe("neutral");
  });

  it("scores English cues as whole words only", () => {
    expect(scoreSentiment("Wonyoung is so pretty and talented").label).toBe("positive");
    expect(scoreSentiment("this song is boring, hate it").label).toBe("negative");
    expect(scoreSentiment("we ate lunch late").label).toBe("neutral");
  });
});

describe("extractKeywords", () => {
  it("counts across comments, once per comment, minus stopwords", () => {
    const texts = ["직캠 미모 직캠 직캠", "직캠 좋다", "진짜 너무 미모"];
    const kws = extractKeywords(texts);
    expect(kws.find((k) => k.word === "직캠")?.count).toBe(2);
    expect(kws.find((k) => k.word === "미모")?.count).toBe(2);
    expect(kws.find((k) => k.word === "진짜")).toBeUndefined();
  });

  it("strips stacked trailing josa and honors exclude", () => {
    const kws = extractKeywords(["원영이 미모 최고", "유진이가 유진아 최고"], {
      exclude: new Set(["원영", "유진"]),
    });
    for (const w of ["원영", "원영이", "유진", "유진이", "유진이가", "유진아"]) {
      expect(kws.find((k) => k.word === w)).toBeUndefined();
    }
  });

  it("filters English function words", () => {
    const kws = extractKeywords(["she is so pretty and they love her stage"]);
    expect(kws.find((k) => k.word === "she")).toBeUndefined();
    expect(kws.find((k) => k.word === "they")).toBeUndefined();
    expect(kws.find((k) => k.word === "pretty")).toBeDefined();
  });
});

describe("analyzeComments", () => {
  const c = (id: string, text: string, likeCount = 0) => ({ id, text, likeCount });

  it("aggregates per member with sentiment and top comment", () => {
    const result = analyzeComments([
      c("1", "유진이 진짜 예쁘다", 5),
      c("2", "유진 파트 별로였음", 1),
      c("3", "안유진 <b>여신</b> 그 자체", 10),
      c("4", "오늘 날씨 얘기만 하는 댓글", 99),
    ]);
    const yujin = result.members.find((m) => m.member.key === "yujin")!;
    expect(yujin.mentionCount).toBe(3);
    expect(yujin.sentiment).toEqual({ positive: 2, negative: 1, neutral: 0 });
    expect(yujin.positiveRate).toBeCloseTo(2 / 3);
    expect(yujin.topComment?.id).toBe("3");
    expect(result.total).toBe(4);
  });

  it("attributes pre-tagged units (member's own IG post) without a name mention", () => {
    const result = analyzeComments([
      { id: "1", text: "오늘도 행복한 하루 🤍", likeCount: 0, members: ["wonyoung"] },
    ]);
    const wonyoung = result.members.find((m) => m.member.key === "wonyoung")!;
    expect(wonyoung.mentionCount).toBe(1);
    expect(wonyoung.sentiment.positive).toBe(1);
  });

  it("does not double-count when tagged and mentioned", () => {
    const result = analyzeComments([
      { id: "1", text: "원영이 셀카 최고", likeCount: 0, members: ["wonyoung"] },
    ]);
    expect(
      result.members.find((m) => m.member.key === "wonyoung")!.mentionCount,
    ).toBe(1);
  });

  it("maps IG usernames to member keys", () => {
    expect(memberKeyForIgUsername("for_everyoung10")).toBe("wonyoung");
    expect(memberKeyForIgUsername("eeseooes")).toBe("leeseo");
    expect(memberKeyForIgUsername("ivestarship")).toBeUndefined();
  });

  it("rolls up sentiment per origin", () => {
    const result = analyzeComments([
      { id: "1", text: "유진 최고 예쁘다", likeCount: 0, origin: "youtube" },
      { id: "2", text: "아이브 컴백 일정 발표", likeCount: 0, origin: "news" },
      { id: "3", text: "이번 앨범 별로임", likeCount: 0, origin: "dc" },
    ]);
    expect(result.sources.youtube).toEqual({ positive: 1, neutral: 0, negative: 0 });
    expect(result.sources.news).toEqual({ positive: 0, neutral: 1, negative: 0 });
    expect(result.sources.dc).toEqual({ positive: 0, neutral: 0, negative: 1 });
  });

  it("sorts members by mention count and excludes alias keywords", () => {
    const result = analyzeComments([
      c("1", "레이 레이 레이 귀엽다"),
      c("2", "레이 미모"),
      c("3", "이서 최고"),
    ]);
    expect(result.members[0].member.key).toBe("rei");
    const rei = result.members[0];
    expect(rei.keywords.find((k) => k.word === "레이")).toBeUndefined();
  });
});
