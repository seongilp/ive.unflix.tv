// Shared timestamp parsing for comment text (mm:ss or hh:mm:ss).

export const TIMESTAMP_RE = /\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/g;

// Seconds of the FIRST timestamp in a string, or null if none.
export function firstTimestampSeconds(text: string): number | null {
  const m = new RegExp(TIMESTAMP_RE).exec(text);
  if (!m) return null;
  const [, a, b, c] = m;
  return c
    ? Number(a) * 3600 + Number(b) * 60 + Number(c)
    : Number(a) * 60 + Number(b);
}
