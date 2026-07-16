// Aggregates comments into per-member keyword + sentiment profiles.

import { stripHtml } from "../feed/html";
import { MEMBERS, detectMembers, type Member } from "./members";
import { scoreSentiment, type Sentiment } from "./sentiment";
import { extractKeywords, type Keyword } from "./keywords";

export interface AnalyzableComment {
  id: string;
  text: string; // may contain the HTML subset YouTube emits
  likeCount: number;
  origin?: string; // where it came from ("youtube" | "news" | "dc" | …)
  members?: string[]; // pre-attributed member keys (e.g. the member's own IG post)
}

export type SentimentCounts = Record<Sentiment, number>;

export interface MemberAnalysis<C extends AnalyzableComment = AnalyzableComment> {
  member: Member;
  mentionCount: number;
  sentiment: SentimentCounts;
  positiveRate: number; // positive / mentions (0 when no mentions)
  keywords: Keyword[];
  topComment: C | null; // most-liked mentioning comment
}

export interface ChannelAnalysis<C extends AnalyzableComment = AnalyzableComment> {
  total: number;
  sentiment: SentimentCounts;
  sources: Record<string, SentimentCounts>; // per-origin rollup, insertion order
  keywords: Keyword[];
  members: MemberAnalysis<C>[]; // sorted by mentionCount desc
}

const KEYWORD_TOP = 12;

// Every member alias (plus display names) — excluded from keyword lists since
// "장원영" being the top keyword for 장원영 says nothing.
export const ALIAS_EXCLUDE = new Set(
  MEMBERS.flatMap((m) => [...m.aliases, m.name, "아이브", "ive"]),
);

function emptyCounts(): SentimentCounts {
  return { positive: 0, neutral: 0, negative: 0 };
}

export function analyzeComments<C extends AnalyzableComment>(
  comments: C[],
): ChannelAnalysis<C> {
  const overall = emptyCounts();
  const sources: Record<string, SentimentCounts> = {};
  const overallTexts: string[] = [];
  const perMember = new Map<
    string,
    { counts: SentimentCounts; texts: string[]; top: C | null }
  >(MEMBERS.map((m) => [m.key, { counts: emptyCounts(), texts: [], top: null }]));

  for (const comment of comments) {
    const text = stripHtml(comment.text);
    if (!text) continue;
    const { label } = scoreSentiment(text);
    overall[label]++;
    if (comment.origin) {
      (sources[comment.origin] ??= emptyCounts())[label]++;
    }
    overallTexts.push(text);

    const memberKeys = new Set([
      ...detectMembers(text),
      ...(comment.members ?? []),
    ]);
    for (const key of memberKeys) {
      const slot = perMember.get(key);
      if (!slot) continue;
      slot.counts[label]++;
      slot.texts.push(text);
      if (!slot.top || comment.likeCount > slot.top.likeCount) {
        slot.top = comment;
      }
    }
  }

  const members = MEMBERS.map((member) => {
    const slot = perMember.get(member.key);
    const counts = slot?.counts ?? emptyCounts();
    const mentionCount = counts.positive + counts.neutral + counts.negative;
    return {
      member,
      mentionCount,
      sentiment: counts,
      positiveRate: mentionCount === 0 ? 0 : counts.positive / mentionCount,
      keywords: extractKeywords(slot?.texts ?? [], {
        exclude: ALIAS_EXCLUDE,
        top: KEYWORD_TOP,
      }),
      topComment: slot?.top ?? null,
    };
  }).sort((a, b) => b.mentionCount - a.mentionCount);

  return {
    total: overallTexts.length,
    sentiment: overall,
    sources,
    keywords: extractKeywords(overallTexts, {
      exclude: ALIAS_EXCLUDE,
      top: KEYWORD_TOP,
    }),
    members,
  };
}
