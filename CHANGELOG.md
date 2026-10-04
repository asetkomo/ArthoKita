# Changelog

All notable changes to Dompetku are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dompetku has no numbered releases yet: it is deployed straight from `main`, so entries are grouped by date and by the pull request that introduced them.

> [!NOTE]
> When an entry mentions a **schema section** (`v2`…`v13`), self-hosters must run that section of [`supabase/schema.sql`](supabase/schema.sql) on their Supabase project. Every section is safe to run more than once, and the app keeps working (with the feature disabled) until you do.

## [Unreleased]

### Added

- Open-source project files: MIT `LICENSE`, contributing guide, code of conduct, security policy, support guide, issue forms, English pull request template, Dependabot and CODEOWNERS.
- Repository metadata (`license`, `repository`, `homepage`, `bugs`) in `package.json`.

## 2026-10-04 — Roadmap 1–14 and privacy mode ([#4](https://github.com/ilramdhan/fintrack/pull/4))

### Added

- **Privacy mode**: eye toggle in the app shell (also `Shift+H`) masks every amount, balance, chart and gold weight on the current device; set before first paint so nothing flashes.
- **Two-step login (TOTP)** with optional `APP_TOTP_SECRET`, a signed 5-minute challenge and a Settings card to check status and enroll.
- **Recurring transactions** (schema `v10`): salary, rent and routine transfers posted automatically, plus a page with post-now and pause/resume, and recurring reminders.
- **Budget rollover and instant 80%/100% alerts** (schema `v11`) on the web (toast) and in Telegram bot replies, deduplicated per month.
- **Split transactions** (schema `v12`): split one receipt across several categories, with OCR item grouping.
- **Multiple receipt photos** (up to 5 per transaction, schema `v12`) with thumbnails and a gallery viewer; search now matches receipt item names.
- **Account detail page** (schema `v13`): monthly per-account report, balance chart and bank-statement reconciliation.
- **Savings goal projection**: monthly/weekly amount needed, status and ETA.
- **Backup and restore**: scheduled backup endpoint for n8n and restore from a JSON file.
- **Error monitoring**: structured JSON error logs with optional Sentry (`SENTRY_DSN`).
- Report aggregation in Postgres functions (schema `v9`) with an identical JavaScript fallback.
- Typed Supabase client (`src/lib/database.types.ts`).
- GitHub Actions CI (lint, typecheck, test, build) and a pull request template.

### Changed

- Fonts are self-hosted instead of loaded from Google Fonts.
- Charts (Recharts) are lazy-loaded, and routes show skeletons while loading.
- Code formatted with Prettier; remaining ESLint errors fixed.

### Fixed

- Backup/restore now includes recurring transactions, budget alerts and reconciliations, and skips the generated `items_search` column.
- Deleting a transaction or using the bot's `/undo` keeps receipt photos still used by other (split) transactions.

## 2026-10-04 — Mobile polish and goals as transfers ([#3](https://github.com/ilramdhan/fintrack/pull/3))

### Added

- Savings goal deposits and withdrawals are recorded as transfers between accounts (schema `v8`).

### Fixed

- Goal transfers use the source account's currency.
- Dashboard cards, subscription rows and other pages no longer overflow on narrow screens; gold records use stacked cards on mobile and a table on desktop; dialogs are rounded at every width.

## 2026-10-04 — Performance, responsiveness and security ([#2](https://github.com/ilramdhan/fintrack/pull/2))

### Added

- Baseline security headers on all responses.
- Login throttling after repeated failed attempts.
- Icon-rail sidebar on medium screens, compact header on short landscape screens, and a menu for secondary transaction actions on smaller screens.

### Changed

- Fewer sequential Supabase round trips on the dashboard; the session check is cached client-side between navigations.
- Vercel functions run in Singapore (`sin1`) to sit next to Supabase.
- Dropped an unused font weight.

### Fixed

- Aggregate queries page past PostgREST's 1000-row limit.
- Money values, cards and charts stay readable on narrow and short screens.
- OCR shows the AI provider's error reason to the user.
- n8n Telegram Trigger no longer drops inline-button callbacks.

## 2026-10-03 — Telegram bot v2 ([#1](https://github.com/ilramdhan/fintrack/pull/1))

### Added

- **Telegram bot v2**: a single `/api/public/n8n/bot` endpoint, preview with ✅/❌ buttons before saving, a zero-token quick parser for chat messages, reports and `/undo`; drafts are idempotent (schema `v7`).

### Security

- The bot fails closed when `BOT_ALLOWED_CHAT_IDS` is empty, drafts are scoped to the chat, `/undo` only removes bot-saved transactions, image MIME types are restricted and request bodies are size-capped.

### Fixed

- Quick-parse amounts and accounts, impossible dates rejected, deterministic account/category name matching, and bot reports page through all rows.

## 2026-10-01 – 2026-10-03 — Initial version

The first version was built with [Lovable](https://lovable.dev) on a TanStack Start template. It included:

- Income, expenses, transfers, debts/instalments (including pay-later), subscriptions in IDR/USD with tax, budgets and savings goals.
- Multiple payment accounts with transfer/top-up/monthly admin fees (schema `v4`).
- Receipt photo OCR and CSV import (schema `v2`).
- Activity log, gold savings with world/Antam prices, and receivables (schemas `v3`, `v5`, `v6`).
- Dashboard, reports, monthly reminders, n8n automation endpoints, single-user login from environment variables, ID/EN language switch, dark mode and an installable PWA manifest.

[Unreleased]: https://github.com/ilramdhan/fintrack/compare/814bdd3...HEAD
