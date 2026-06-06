"use client";

import { Fragment, type ReactNode } from "react";

// Matches video timestamps: mm:ss or hh:mm:ss (e.g. 16:40, 1:02:03).
// Minutes/seconds require two digits so "1:2" or stray colons don't match.
const TIMESTAMP = /\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/g;

function toSeconds(a: string, b: string, c?: string): number {
  return c
    ? Number(a) * 3600 + Number(b) * 60 + Number(c)
    : Number(a) * 60 + Number(b);
}

// Renders comment text, turning timestamps into links that jump to that moment
// in the video on YouTube (opens in a new tab).
export function CommentText({
  text,
  videoId,
}: {
  text: string;
  videoId: string | null;
}) {
  if (!videoId) return <>{text}</>;

  const nodes: ReactNode[] = [];
  const re = new RegExp(TIMESTAMP);
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const [full, a, b, c] = m;
    if (m.index > last) nodes.push(text.slice(last, m.index));

    const seconds = toSeconds(a, b, c);
    nodes.push(
      <a
        key={m.index}
        href={`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="font-semibold text-accent hover:underline"
      >
        {full}
      </a>,
    );
    last = m.index + full.length;
  }

  if (last < text.length) nodes.push(text.slice(last));

  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}
