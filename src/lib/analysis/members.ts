// IVE member roster + alias matching for comment mention detection.

export interface Member {
  key: string;
  name: string; // display name (Korean)
  aliases: string[]; // lowercase; matched with boundary rules below
  igUsername: string; // personal Instagram — posts attribute to the member
}

export const MEMBERS: Member[] = [
  { key: "yujin", name: "안유진", aliases: ["안유진", "유진", "yujin"], igUsername: "_yujin_an" },
  { key: "gaeul", name: "가을", aliases: ["가을", "gaeul"], igUsername: "fallingin__fall" },
  { key: "rei", name: "레이", aliases: ["레이", "rei"], igUsername: "reinyourheart" },
  { key: "wonyoung", name: "장원영", aliases: ["장원영", "원영", "wonyoung"], igUsername: "for_everyoung10" },
  { key: "liz", name: "리즈", aliases: ["리즈", "liz"], igUsername: "liz.yeyo" },
  { key: "leeseo", name: "이서", aliases: ["이서", "leeseo"], igUsername: "eeseooes" },
];

// Member key for a personal Instagram username (undefined for 공식/unknown).
export function memberKeyForIgUsername(username: string): string | undefined {
  return MEMBERS.find((m) => m.igUsername === username)?.key;
}

// Josa/suffix characters allowed right after an alias ("유진이", "레이가",
// "원영님"). Any other Hangul/alnum continuation means it's a different word
// ("레이싱", "플레이" — rejected by the preceding-char rule).
const TRAILING_PARTICLES = new Set([
  ..."이가은는을를의도만아야랑에께님씨와과요",
]);

const WORD_CHAR = /[가-힣a-z0-9]/;

// True when `alias` occurs in `text` as its own word: the preceding char is a
// boundary, and the following char is a boundary or a particle.
export function mentionsAlias(text: string, alias: string): boolean {
  let from = 0;
  for (;;) {
    const i = text.indexOf(alias, from);
    if (i < 0) return false;
    from = i + 1;
    const prev = i > 0 ? text[i - 1] : "";
    if (prev && WORD_CHAR.test(prev)) continue;
    const next = text[i + alias.length] ?? "";
    if (!next || !WORD_CHAR.test(next) || TRAILING_PARTICLES.has(next)) {
      return true;
    }
  }
}

// Member keys mentioned in a comment (lowercase the text once per comment).
export function detectMembers(text: string): string[] {
  const lower = text.toLowerCase();
  return MEMBERS.filter((m) =>
    m.aliases.some((a) => mentionsAlias(lower, a)),
  ).map((m) => m.key);
}
