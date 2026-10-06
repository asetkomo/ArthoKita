#!/usr/bin/env node
/**
 * Dev-only: renders the PNG icons (favicon, apple-touch, PWA, maskable, og-image) from
 * public/logo.svg with a headless Chromium. Not a project dependency — run with:
 *
 *   npx -p playwright node scripts/render-icons.mjs
 *
 * (`npx playwright install chromium` once if the browser is missing.)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Resolve playwright from the project or from the `npx -p playwright` bin dir on PATH. */
function loadPlaywright() {
  const bases = [join(root, "package.json")];
  for (const p of (process.env.PATH ?? "").split(delimiter)) {
    if (p.endsWith(join("node_modules", ".bin"))) bases.push(join(p, "..", "x.js"));
  }
  for (const base of bases) {
    try {
      return createRequire(base)("playwright");
    } catch {
      // try next
    }
  }
  console.error("playwright not found — run: npx -p playwright node scripts/render-icons.mjs");
  process.exit(1);
}

const svg = readFileSync(join(root, "public/logo.svg"), "utf8");
const svgData = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
const font = (f) =>
  `data:font/woff2;base64,${readFileSync(join(root, "public/fonts", f)).toString("base64")}`;
const GREEN = "#1d3b2f";
const CREAM = "#faf6ef";
const GOLD = "#e8b84a";

/** Logo with transparent rounded corners. */
const tile = (size) => ({
  w: size,
  h: size,
  html: `<img src="${svgData}" width="${size}" height="${size}" style="display:block">`,
});

/** Full-bleed square (no transparency) with the mark inside the maskable safe zone. */
const square = (size, scale) => ({
  w: size,
  h: size,
  opaque: true,
  html: `<div style="width:${size}px;height:${size}px;background:${GREEN};display:grid;place-items:center">
    <img src="${svgData}" width="${Math.round(size * scale)}" style="display:block"></div>`,
});

const og = {
  w: 1200,
  h: 630,
  opaque: true,
  html: `<style>
    @font-face{font-family:B;src:url(${font("bricolage-grotesque-latin-opsz-normal.woff2")})}
    @font-face{font-family:F;src:url(${font("figtree-latin-wght-normal.woff2")})}
  </style>
  <div style="width:1200px;height:630px;background:${GREEN};color:${CREAM};display:flex;align-items:center;gap:56px;padding:0 110px;box-sizing:border-box">
    <img src="${svgData}" width="220" style="border-radius:52px;box-shadow:0 0 0 2px #ffffff22">
    <div>
      <div style="font:700 112px/1 B;letter-spacing:-3px">Arhokita<span style="color:${GOLD}">.</span></div>
      <div style="font:500 36px/1.35 F;margin-top:22px;opacity:.85;max-width:640px">Buku kas pribadi — catat pemasukan, pengeluaran, dan tagihan dalam satu tempat.</div>
    </div>
  </div>`,
};

const targets = {
  "public/favicon.png": tile(64),
  "public/icons/favicon-32.png": tile(32),
  "public/icons/favicon-48.png": tile(48),
  // iOS masks the corners itself, so the apple icon is a full-bleed square.
  "public/icons/apple-touch-icon.png": square(180, 1),
  "public/icons/icon-192.png": tile(192),
  "public/icons/icon-512.png": tile(512),
  // Maskable: mark kept inside the central 80% safe zone.
  "public/icons/icon-maskable-512.png": square(512, 0.72),
  "public/icons/og-image.png": og,
  "src/assets/app-icon.png": tile(1024),
};

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
for (const [out, t] of Object.entries(targets)) {
  const page = await browser.newPage({ viewport: { width: t.w, height: t.h } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${t.html}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: !t.opaque });
  mkdirSync(dirname(join(root, out)), { recursive: true });
  writeFileSync(join(root, out), png);
  console.log("wrote", out);
  await page.close();
}
await browser.close();
