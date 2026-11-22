// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact, tailwindcss, nitro etc.
// Do not add them manually. MOBILE_BUILD=1 produces a static SPA in dist/client for Capacitor.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const mobile = process.env["MOBILE_BUILD"] === "1";

export default defineConfig(
  mobile
    ? {
        tanstackStart: {
          spa: { enabled: true, prerender: { outputPath: "/index", crawlLinks: false } },
        },
        nitro: false,
      }
    : {
        tanstackStart: {
          // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
          server: { entry: "server" },
        },
      },
);
