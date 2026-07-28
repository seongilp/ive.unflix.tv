# IVE LIVE

Replay a YouTube channel's video comments as a scrolling **live‑chat** stream —
like a Twitch/YouTube live chat, but built from the comments people already left.

Defaults to the channel [`@IVEstarship`](https://www.youtube.com/@IVEstarship),
and you can load any other channel from the header.

## How it works

- `GET /api/channel?handle=@name` → resolves the channel and lists recent uploads.
- `GET /api/comments?videoId=…` → returns top‑level comments (paginated).
- The UI buffers comments and reveals them one at a time on a timer, fetching
  more pages as the buffer drains, so it feels like a live chat rolling by.

Controls: **play/pause**, **speed** (slow / normal / fast), comment **order**
(top vs newest), **loop** (replay forever), and a **theater** mode that hides
the video list for a clean overlay.

### Views

The header switches between eight modes; five are channel-wide rather than
per-video (`hall`, `search`, `feed`, `analysis`, `risk`):

- **라이브 / 동기화 / 목록** — comment replay (free-running, timestamp-synced to
  the player, or a plain list).
- **전당 / 검색** — top comments across the channel, and full-text search.
- **피드** — 유튜브·뉴스(네이버)·다음·DC·네이트판·인스타 items in one stream.
- **분석** — sentiment / keyword breakdown of the loaded comments.
- **리스크** — OSINT-style threat monitor over the D1 snapshot series: per-member
  threat level, mention/negativity trends, the alert feed, a source matrix, and
  the interactive Chatter Cloud (scope / timeline / 빈도·급상승 / per-word drilldown).
  Snapshots are collected every 2h; alerts only fire on deviation from each
  channel's own baseline.

## Setup

1. Get a **YouTube Data API v3** key from the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (enable "YouTube Data API v3" for your project).
2. Add it to `.env.local`:

   ```
   YOUTUBE_API_KEY=your_key_here
   ```

3. Install and run:

   ```bash
   pnpm install
   pnpm dev
   ```

4. Open http://localhost:3000.

## Deploy (ebs home server · Next standalone)

Live: **https://ive.unflix.tv** — a cloudflared tunnel fronts
`ebs:127.0.0.1:8490`, where systemd's `app-ive.service` runs
`/home/ubuntu/apps/ive/server.js` (`output: "standalone"`).

Nothing in `src/` knows it left Workers: `src/instrumentation.ts` injects a
file-backed KV, a `node:sqlite` D1, and a fire-and-forget `waitUntil` into the
`__cloudflare-context__` global, so `appCache()` / `riskDb()` / `bg()` keep
working unchanged.

There is no auto-deploy. Build locally, rsync, restart:

```bash
pnpm build
rm -rf .next/standalone/.next/static && cp -R .next/static .next/standalone/.next/static
ssh ebs 'tar czf /tmp/ive-backup-$(date +%F-%H%M%S).tar.gz -C ~/apps ive'
rsync -a --delete --exclude .env.runtime .next/standalone/ ebs:/home/ubuntu/apps/ive/
ssh ebs 'sudo systemctl restart app-ive && systemctl is-active app-ive'
curl -sI https://ive.unflix.tv | head -1
```

`--exclude .env.runtime` is load-bearing: that file (server-side only) holds
`PORT`/`HOSTNAME`, the KV/D1 shim paths, and the API keys — see `.env.example`.
Rollback = untar the backup over `~/apps/ive` and restart.

The risk collector runs on the same host: `worker-host.mjs` drives
`workers/cron`'s worker from crontab (collect every 2h, discover 2×/day) against
`APP_BASE=http://127.0.0.1:8490`, bypassing the tunnel.

### Cloudflare Workers (legacy path)

The [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) setup
(`open-next.config.ts`, `wrangler.jsonc`) is still in the repo, but the
`workers.dev` deployment is currently down (404). To bring it back:

```bash
# one-time: create the KV namespaces and paste ids into wrangler.jsonc
pnpm exec wrangler kv namespace create SHORTS_CACHE
pnpm exec wrangler kv namespace create NEXT_INC_CACHE_KV

# set the API key as a Worker secret (not committed)
printf 'YOUR_KEY' | pnpm exec wrangler secret put YOUTUBE_API_KEY

# build + deploy
pnpm run deploy       # opennextjs-cloudflare build && deploy
pnpm preview          # build + run locally on workerd
```

Bindings the Workers path expects (mirrored by the shims above):
- `SHORTS_CACHE` — caches each channel's video/Shorts classification (1-day TTL),
  so steady-state requests make far fewer subrequests.
- `NEXT_INC_CACHE_KV` — OpenNext incremental cache, fronted by a regional
  edge cache (Cache API).
- `RISK_DB` — D1 time series for the risk dashboard (`migrations/0001_risk.sql`).

### GitHub Actions

Only Claude automation lives in CI: `claude.yml` (label an issue `claude` → it
opens an implementation PR) and `claude-notify-merge.yml` (Telegram ping on
merge). Merges and deploys are manual.

## Notes

- The YouTube Data API has a daily quota; each comment page costs ~1 unit.
- Videos with comments disabled will surface a clean error in the stream area.
- This shows **existing** comments as a simulated live feed — it does not read a
  real live broadcast's live chat.
