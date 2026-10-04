// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// App version shown in the UI (src/lib/version.ts): package.json "version" (bumped by
// release-please) plus the short commit SHA — Vercel's build env first, else local git.
// Lovable/CI may lack git, so any failure just leaves the commit empty.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version?: string;
};
function buildCommit(): string {
  const fromEnv = process.env["VERCEL_GIT_COMMIT_SHA"] ?? process.env["GITHUB_SHA"] ?? "";
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}
const versionDefine = {
  __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
  __APP_COMMIT__: JSON.stringify(buildCommit()),
  __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
};

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
  // Merged by the Lovable wrapper (mergeConfig) on top of its own VITE_* define injection.
  vite: { define: versionDefine },
});
