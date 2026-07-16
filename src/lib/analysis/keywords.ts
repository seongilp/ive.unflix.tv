// Frequency-based keyword extraction for Korean/Latin comment text.

// Function words + comment-section noise that never make a good keyword.
const STOPWORDS = new Set([
  "진짜", "정말", "너무", "근데", "그냥", "그리고", "그래서", "하지만",
  "오늘", "영상", "댓글", "진심", "완전", "이거", "저거", "그거", "여기",
  "저기", "우리", "제발", "같아", "같은", "같다", "하는", "있는", "없는",
  "이번", "다음", "계속", "항상", "언제", "모두", "다들", "저는", "나는",
  "아니", "그럼", "이제", "요즘", "함께", "해서", "인데", "에서", "으로",
  "까지", "부터", "보다", "사람", "생각", "시간", "하루", "정도", "느낌",
  "보고", "봐도", "보면", "하고", "해도", "하면", "했는데", "그래도",
  "이렇게", "저렇게", "그렇게", "얼마나", "무슨", "어떻게", "어디", "누가",
  "뭔가", "약간", "the", "and", "you", "for", "this", "that", "with",
  "are", "she", "they", "her", "his", "him", "has", "have", "had", "was",
  "were", "but", "not", "all", "can", "will", "just", "who", "what", "when",
  "where", "how", "why", "its", "our", "out", "get", "got", "one", "two",
  "now", "very", "really", "much", "many", "them", "then", "than", "there",
  "here", "from", "your", "about", "been", "being", "because", "into",
  "over", "also", "only", "even", "still", "did", "does", "doing", "would",
  "could", "should", "which", "while", "some", "more", "most", "other",
  "after", "before", "their", "these", "those", "every", "always",
]);

// Trailing josa stripped (repeatedly) from 3+ char tokens, so "유진이가" and
// "원영이" both normalize to the bare name.
const TRAILING_JOSA = new Set([..."이가은는을를의도만에야요아"]);

export interface Keyword {
  word: string;
  count: number;
}

function tokenize(text: string): string[] {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\d+:\d+(?::\d+)?/g, " ") // video timestamps
    .toLowerCase();
  const raw = cleaned.match(/[가-힣]{2,}|[a-z]{3,}/g) ?? [];
  return raw.map((t) => {
    if (!/[가-힣]/.test(t)) return t;
    let word = t;
    while (word.length >= 3 && TRAILING_JOSA.has(word[word.length - 1])) {
      word = word.slice(0, -1);
    }
    return word;
  });
}

// Unique keyword-worthy tokens of one text (stopwords/short/excluded removed).
// Uniqueness per text keeps one spammy comment from dominating counts.
export function keywordTokens(
  text: string,
  exclude: Set<string> = new Set(),
): string[] {
  const seen = new Set<string>();
  for (const token of tokenize(text)) {
    if (token.length < 2 || STOPWORDS.has(token) || exclude.has(token)) continue;
    seen.add(token);
  }
  return [...seen];
}

// Top keywords across `texts`, excluding stopwords and any `exclude` words
// (e.g. the member's own aliases).
export function extractKeywords(
  texts: string[],
  { exclude = new Set<string>(), top = 10 }: { exclude?: Set<string>; top?: number } = {},
): Keyword[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of keywordTokens(text, exclude)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, top);
}
