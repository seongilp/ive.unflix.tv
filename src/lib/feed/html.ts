// Strip HTML tags and decode the handful of entities the source APIs emit
// (Naver wraps matches in <b> and HTML-encodes quotes/ampersands).
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#0*39;|&#x0*27;/gi, "'") // decimal + hex apostrophe (Nate uses hex)
    .replace(/&#0*34;|&#x0*22;/gi, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1)}…` : input;
}
