import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

export default defineCloudflareConfig({
  // Next's incremental cache (ISR/data cache) stored in Workers KV, fronted by
  // a per-region edge cache (Cache API) so hot entries skip the KV round-trip.
  incrementalCache: withRegionalCache(kvIncrementalCache, {
    mode: "long-lived",
  }),
});
