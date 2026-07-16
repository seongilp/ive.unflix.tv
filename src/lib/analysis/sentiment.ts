// Lexicon-based Korean sentiment scoring tuned for K-pop fan comments.
// Substring stems sidestep conjugation ("예쁘다/예뻐요/예쁨" all hit "예쁘"/"예뻐").

export type Sentiment = "positive" | "negative" | "neutral";

const POSITIVE_STEMS = [
  "예쁘", "예뻐", "예쁨", "이쁘", "이뻐", "귀엽", "귀여", "최고", "사랑",
  "좋아", "좋다", "좋았", "좋네", "좋음", "멋지", "멋있", "대박", "완벽",
  "천재", "여신", "설레", "행복", "감동", "잘하", "잘해", "잘했", "잘생",
  "고마", "고맙", "감사", "응원", "화이팅", "파이팅", "존예", "존잘", "존귀",
  "레전드", "미쳤", "찢었", "찢어", "흥해", "축하", "아름답", "매력", "상큼",
  "청량", "힐링", "소중", "명곡", "띵곡", "중독", "기대", "신난", "즐거",
  "재밌", "재미있", "웃겨", "웃기", "사랑스", "비주얼", "미모", "우아",
  "보고싶", "그리웠", "반가", "멋져", "포카", "덕질", "입덕", "팬이야",
  "짱", "굿", "쵝오", "커여", "이뻤", "예뻤", "갓벽", "폼미쳤",
] as const;

const NEGATIVE_STEMS = [
  "싫어", "싫다", "별로", "최악", "실망", "못하", "못해", "못생", "아쉽",
  "짜증", "화나", "화난", "불편", "논란", "욕먹", "극혐", "혐오", "노잼",
  "망했", "망함", "지루", "뻔하", "오글", "어색", "억지", "쓰레기", "그만해",
  "하차", "탈퇴해", "재수없", "꺼져", "안타깝", "구리", "촌스", "역겹",
  "밉상", "짜게", "선넘", "선을 넘", "노답", "폭망", "나락", "악플",
  "불화", "루머", "사재기", "표절", "학폭", "갑질", "인성 논란",
  "음주운전", "성희롱", "성추행",
] as const;

const POSITIVE_EMOJI = [..."❤🧡💛💚💙💜🤍🖤💕💖💗💓💞💘😍🥰🥹😊😁🤩👍✨🔥🎉"];
const NEGATIVE_EMOJI = [..."👎😡🤬💢🤮😒"];

// English cues need word boundaries ("ate" hides in "late"), so they're
// matched as whole words instead of substrings.
const POSITIVE_WORDS_RE =
  /\b(love|loved|cute|pretty|beautiful|amazing|perfect|queen|queens|legend|legendary|gorgeous|stunning|adorable|talented|awesome|iconic|slay|slays|best|wow|angel|goddess|precious|proud|happy|incredible|good)\b/g;
const NEGATIVE_WORDS_RE =
  /\b(hate|hated|ugly|worst|boring|disappointing|disappointed|flop|cringe|annoying|terrible|awful|trash|rude|overrated)\b/g;

function countRegexHits(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

function countHits(text: string, patterns: readonly string[]): number {
  let n = 0;
  for (const p of patterns) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(p, from);
      if (i < 0) break;
      n++;
      from = i + p.length;
    }
  }
  return n;
}

export interface SentimentResult {
  label: Sentiment;
  positive: number; // matched positive cues
  negative: number; // matched negative cues
}

export function scoreSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const positive =
    countHits(text, POSITIVE_STEMS) +
    countHits(text, POSITIVE_EMOJI) +
    countRegexHits(lower, POSITIVE_WORDS_RE);
  const negative =
    countHits(text, NEGATIVE_STEMS) +
    countHits(text, NEGATIVE_EMOJI) +
    countRegexHits(lower, NEGATIVE_WORDS_RE);
  const label: Sentiment =
    positive > negative ? "positive" : negative > positive ? "negative" : "neutral";
  return { label, positive, negative };
}
