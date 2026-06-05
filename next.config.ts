import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  images: {
    // Workers runs no Node image optimizer; serve YouTube images unoptimized.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.ggpht.com" },
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "**.ytimg.com" },
    ],
  },
};

export default nextConfig;

// Expose Cloudflare bindings (KV, etc.) to `next dev` via getCloudflareContext().
initOpenNextCloudflareForDev();
