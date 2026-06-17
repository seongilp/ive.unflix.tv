# 피드 (Feed) — Design Spec

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Author:** brainstorming session

## Summary

Add a new top-level view, **피드**, to the RESCENE fan site. It aggregates
recent posts mentioning RESCENE across six external sources into a single,
newest-first timeline of **link-out cards**, each leading with a clear **source
badge**. A Cloudflare Cron Trigger refreshes the merged feed every 5 minutes
into KV; the UI reads from a cached `/api/feed` endpoint.

This extends the existing app pattern (YouTube channel/comments views driven by
a `ViewMode` segmented control, `/api/*` routes backed by KV with
stale-while-revalidate).

## Goals

- A unified, near-real-time (5-minute) feed of RESCENE-related posts.
- One normalized item shape so the UI never branches per platform.
- Source filter chips (전체 + one per source).
- Link-out cards (source badge → title → snippet → author → relative time →
  optional thumbnail) that open the original post in a new tab.
- Per-source isolation: one source failing never blanks the feed.
- Honest, graceful degradation where a source is blocked or unavailable.

## Non-Goals (v1)

- Rendering full post text/media inline (link-out only — avoids
  hotlinking/copyright/bandwidth risk).
- Public hashtag/account reading for Instagram/Threads (no such API exists).
- A Korean-IP relay/proxy to unblock 더쿠/인스티즈 from Cloudflare edge IPs
  (noted as a future enhancement).
- User accounts, saving, commenting, or notifications on feed items.

## Data Model

A single normalized item; every adapter maps its native payload onto this:

```ts
type FeedSource =
  | "naver"
  | "dc"
  | "instagram"
  | "threads"
  | "theqoo"
  | "instiz";

interface FeedItem {
  id: string;          // stable dedupe key: `${source}:${nativeId | urlHash}`
  source: FeedSource;
  author: string;      // poster / outlet name
  title: string;       // post title or first line
  snippet: string;     // plain-text excerpt, capped (~200 chars)
  url: string;         // link-out to the original post
  thumbnail?: string;  // optional preview image url (kept as-is, not proxied)
  publishedAt: number; // epoch ms — the merge sort key
}
```

## Architecture

### Source adapters — `src/lib/feed/sources/<source>.ts`

Each source is one small, isolated module exporting:

```ts
fetchItems(keywords: string[]): Promise<FeedItem[]>
```

It owns its own fetching + parsing and normalizes to `FeedItem[]`. Modules are
independently testable and individually replaceable.

**Per-source reality (honest):**

| Source | Method | Reliability from Cloudflare edge |
|---|---|---|
| 네이버 뉴스 | Official Search API (`/v1/search/news.json`) | Solid — the backbone. Requires `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`. |
| DC 리센느 갤러리 | HTML scrape of the gallery list (already group-specific; no keyword filter applied) | Moderate — usually works with a realistic User-Agent; markup-fragile. |
| 인스타그램 | Graph API, **RESCENE's own official account only** | Official-account-only; disabled gracefully when no token configured. |
| 스레드 | Threads API, **own account only** | Same as Instagram. |
| 더쿠 | Scrape search results | High risk — blocks bots and non-KR IPs; likely empty from Cloudflare. |
| 인스티즈 | Scrape search results | Same as 더쿠. |

**Realistic v1 outcome:** 네이버뉴스 + DC carry the feed. Instagram/Threads
light up only when official-account tokens are supplied. 더쿠/인스티즈 are wired
but expected to often return empty from Cloudflare's IPs; they degrade silently.

### Aggregator — `src/lib/feed/aggregate.ts`

1. Run all enabled adapters in parallel with `Promise.allSettled` (one failure
   never aborts the merge).
2. Merge results, dedupe by `id`.
3. Sort by `publishedAt` descending.
4. Cap to ~200 items.

### Keyword config — `src/lib/feed/config.ts`

```ts
export const KEYWORDS = ["리센느", "RESCENE"];
```

Editable; member names can be appended later. Drives the broad sources
(네이버뉴스, 더쿠, 인스티즈, 인스타, 스레드). DC gallery is already
group-specific and ignores keywords.

### Cache + refresh

- **Storage:** reuse the existing `SHORTS_CACHE` KV namespace with a `feed:`
  key prefix (no new namespace to provision). Stores the merged `FeedItem[]`
  plus a timestamp, mirroring `/api/channel`'s `CacheEntry` shape.
- **Refresh:** Cloudflare **Cron Trigger every 5 minutes**
  (`"crons": ["*/5 * * * *"]` in `wrangler.jsonc`) invokes a `scheduled`
  handler that runs `aggregate()` and writes KV.

  **Implementation risk to validate first:** OpenNext's generated worker
  (`.open-next/worker.js`) exports `fetch`, not `scheduled`. **Plan A:** wire a
  `scheduled` handler via OpenNext's worker override mechanism. **Fallback:** a
  small separate Cron Worker that writes the *same* KV namespace. The cron path
  must be proven before adapters are built.

### Read API — `src/app/api/feed/route.ts`

`GET /api/feed?source=all|naver|dc|instagram|threads|theqoo|instiz`

- Reads the merged feed from KV; filters by `source` when not `all`.
- Returns `{ items: FeedItem[] }` (or an `{ error }` envelope on failure).
- **Cold-miss safety:** if cron has not populated KV yet, compute on-demand and
  serve with stale-while-revalidate, exactly like `/api/channel`.
- Edge cache with a short `s-maxage`, consistent with existing routes.

### UI — new `피드` tab

- Add `"feed"` to the `ViewMode` union in `src/app/page.tsx` and a `피드`
  segment to the existing `Segmented` control.
- It is a **channel-wide view** (not tied to the selected video), so it joins
  `CHANNEL_VIEWS` alongside `hall` and `search`. The 인기/최신 order toggle and
  the now-playing bar are hidden in feed mode.
- `src/components/FeedView.tsx`:
  - **Source filter chips:** 전체 / 네이버뉴스 / 인스타 / 스레드 / 더쿠 /
    인스티즈 / DC. The view fetches `/api/feed` once (full merged list, ~200
    items) and filters **client-side** by source — chip switching is instant and
    costs no extra requests. (`/api/feed?source=...` still exists for direct/API
    use.)
  - **Unified list of link-out cards**, newest first. Each card: source badge
    (front) → title → snippet → author → relative time → optional thumbnail.
    Clicking opens `url` in a new tab (`target="_blank" rel="noopener"`).
  - Loading and empty states consistent with existing views (e.g. the
    `EmptyState` component pattern).

## Configuration / Secrets

Added to `.env.example` with comments:

- `NAVER_CLIENT_ID` — required (네이버뉴스 backbone).
- `NAVER_CLIENT_SECRET` — required.
- `INSTAGRAM_ACCESS_TOKEN` + IG business/creator user id — optional.
- `THREADS_ACCESS_TOKEN` — optional.

Missing optional tokens disable that adapter cleanly (it returns `[]`).

## Error Handling

- Adapter level: each `fetchItems` wraps its own fetch/parse in try/catch and
  returns `[]` on failure; never throws into the aggregator.
- Aggregator: `Promise.allSettled`; rejected adapters contribute nothing.
- API: returns a JSON `{ error }` envelope with an appropriate status; never
  serializes `undefined`.
- UI: shows an error/empty state; a partially-populated feed still renders.

## Testing

- **Unit:** each adapter's normalizer maps a captured sample payload to the
  expected `FeedItem[]` (fixtures for Naver JSON, DC HTML, etc.).
- **Unit:** aggregator dedupes by `id`, sorts by `publishedAt` desc, caps to the
  limit, and survives a rejected adapter.
- **Integration:** `/api/feed` returns cached items; `source` filter narrows
  correctly; cold-miss path computes and caches.
- **E2E (Playwright):** 피드 tab renders, source chips filter the list, a card
  links out with `target="_blank"`.

## Open Risks

1. **Cron under OpenNext** — primary risk; validated first (see Cache + refresh).
2. **더쿠/인스티즈/IG/Threads coverage** — accepted as best-effort/often-empty at
   v1; the feed is functional on 네이버뉴스 + DC alone.
3. **DC markup fragility** — scraper may need updates if DC changes its gallery
   HTML; isolated to one adapter module.
