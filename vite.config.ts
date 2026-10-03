// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// On Vercel builds (VERCEL env is set automatically) target the Vercel runtime.
const onVercel = !!process.env["VERCEL"];
// Vercel only: the bot endpoint runs receipt OCR (5–15 s, AI timeout 45 s), above the default
// function limit. nitro's `vercel.functionRules` emits a dedicated function with this config.
// (Declared separately because the Lovable wrapper's types omit `vercel`; it passes nitro options through.)
const vercelNitro = {
  preset: "vercel",
  vercel: { functionRules: { "/api/public/n8n/bot": { maxDuration: 60 } } },
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(onVercel ? { nitro: vercelNitro } : {}),
});
