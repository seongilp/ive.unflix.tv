// Risk-category markers for K-pop reputation monitoring. Presence-based:
// a category counts at most once per document, regardless of repetitions.

export interface RiskCategory {
  key: string;
  label: string; // Korean display label
  stems: string[]; // substring stems (conjugation-tolerant)
}

export const RISK_CATEGORIES: RiskCategory[] = [
  {
    key: "legal",
    label: "법적",
    stems: [
      "마약", "음주운전", "도박", "폭행", "사기", "소송", "고소", "고발",
      "불법", "성희롱", "성추행", "입건", "혐의", "검찰", "경찰 조사",
    ],
  },
  {
    key: "rumor",
    label: "루머",
    stems: ["루머", "지라시", "찌라시", "열애설", "열애", "결혼설", "임신설", "뒷담"],
  },
  {
    key: "bullying",
    label: "학폭·폭로",
    stems: ["학폭", "왕따", "괴롭힘", "폭로", "피해자 주장"],
  },
  {
    key: "attitude",
    label: "태도·인성",
    stems: ["인성", "갑질", "무례", "불성실", "태도 논란", "거만"],
  },
  {
    key: "health",
    label: "건강·활동",
    stems: ["부상", "입원", "응급", "활동 중단", "활동중단", "불참", "건강 이상", "컨디션 난조", "쓰러"],
  },
  {
    key: "contract",
    label: "계약·탈퇴",
    stems: ["탈퇴", "해체", "계약 분쟁", "재계약 불발", "전속계약", "하차"],
  },
  {
    key: "response",
    label: "공식 대응",
    stems: ["사과문", "입장문", "해명", "공식입장", "공식 입장", "법적대응", "법적 대응", "강경 대응"],
  },
  {
    key: "controversy",
    label: "논란 일반",
    stems: ["논란", "구설", "뭇매", "도마에", "비판 쇄도", "시끌"],
  },
];

export const RISK_LABELS: Record<string, string> = Object.fromEntries(
  RISK_CATEGORIES.map((c) => [c.key, c.label]),
);

// Category keys present in `text` (each at most once).
export function detectRiskCategories(text: string): string[] {
  const found: string[] = [];
  for (const cat of RISK_CATEGORIES) {
    if (cat.stems.some((s) => text.includes(s))) found.push(cat.key);
  }
  return found;
}
