# REScene LIVE

Replay a YouTube channel's video comments as a scrolling **live‑chat** stream —
like a Twitch/YouTube live chat, but built from the comments people already left.

Defaults to the channel [`@helloiamwoninicetomeetyou`](https://www.youtube.com/@helloiamwoninicetomeetyou),
and you can load any other channel from the header.

## How it works

- `GET /api/channel?handle=@name` → resolves the channel and lists recent uploads.
- `GET /api/comments?videoId=…` → returns top‑level comments (paginated).
- The UI buffers comments and reveals them one at a time on a timer, fetching
  more pages as the buffer drains, so it feels like a live chat rolling by.

Controls: **play/pause**, **speed** (slow / normal / fast), comment **order**
(top vs newest), **loop** (replay forever), and a **theater** mode that hides
the video list for a clean overlay.

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
   npm install
   npm run dev
   ```

4. Open http://localhost:3000.

## Deploy (Cloudflare Workers)

Runs on Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).

Live: **https://rescene.zihado.workers.dev**

```bash
# one-time: create the KV namespaces and paste ids into wrangler.jsonc
npx wrangler kv namespace create SHORTS_CACHE
npx wrangler kv namespace create NEXT_INC_CACHE_KV

# set the API key as a Worker secret (not committed)
printf 'YOUR_KEY' | npx wrangler secret put YOUTUBE_API_KEY

# build + deploy
npm run deploy        # opennextjs-cloudflare build && deploy
npm run preview       # build + run locally on workerd
```

KV bindings:
- `SHORTS_CACHE` — caches each channel's video/Shorts classification (1-day TTL),
  so steady-state requests make far fewer subrequests.
- `NEXT_INC_CACHE_KV` — OpenNext incremental cache, fronted by a regional
  edge cache (Cache API).

### Auto-deploy on push (GitHub Actions)

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
Add two repo secrets (Settings → Secrets and variables → Actions):
- `CLOUDFLARE_API_TOKEN` — a token with the "Edit Cloudflare Workers" template
- `CLOUDFLARE_ACCOUNT_ID` — your account id

Until `CLOUDFLARE_API_TOKEN` is set, CI builds but skips the deploy step.

## Notes

- The YouTube Data API has a daily quota; each comment page costs ~1 unit.
- Videos with comments disabled will surface a clean error in the stream area.
- This shows **existing** comments as a simulated live feed — it does not read a
  real live broadcast's live chat.
