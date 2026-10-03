<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All DB access goes through server code with the service-role client in `src/lib/db.server.ts`; RLS is on with no policies — the browser never talks to Supabase directly (single-user app, keeps data private).
- Auth is a single env-defined user (APP_USERNAME/APP_PASSWORD) with an HMAC-signed httpOnly cookie; every data server fn uses `requireAuth` middleware.
- External automation (n8n bots/reminders) uses `/api/public/n8n/*` routes guarded by `N8N_API_KEY`; keep business logic in `finance.server.ts` so web and bot share it.
- Schema lives in `supabase/schema.sql` (user runs it on their own Supabase); update it whenever tables change.
- Vercel builds switch nitro preset via the VERCEL env in vite.config.ts, so the same code runs on Lovable and Vercel.
- AI (OCR/text parsing) uses an OpenAI-compatible endpoint configured by AI_API_URL/AI_API_KEY/AI_MODEL for portability.
- Receipt photos live in a private Supabase Storage bucket `receipts`, lazy-created by `src/lib/receipt.server.ts`; transactions store only `receipt_path`, and viewing goes through short-lived signed URLs.
- Dark mode is a `.dark` class on `<html>` set by an inline script in `__root.tsx` (localStorage `dk-theme`); all colors must stay semantic tokens so both themes work.
- Pure, client-safe parsing/formatting (CSV import preview, reminder email builder) lives in `src/lib/csv.ts` / `src/lib/email.ts` so it is unit-testable and shared.
- Direct reminder email uses Resend over fetch (RESEND_API_KEY/EMAIL_FROM/EMAIL_TO, optional); n8n can instead consume the ready-made email payload endpoints.
- Language switch (ID/EN) goes through `LanguageProvider`/`useI18n` in `src/lib/i18n.tsx`; dictionary keys are the original Indonesian strings, `t()` returns the input unchanged for id — wrap all new UI text in `t(...)` and register new keys in the dictionary.
- PWA is manifest-only (public/manifest.webmanifest + public/icons, favicon.png referenced from `__root.tsx`); no service worker is used, keep it that way so previews stay safe.
- Reads of optional tables (activity_log, gold_*, receivables*) go through `isMissingTable()` and degrade to empty/`{ready:false}` so pages never crash before the user runs a new schema section.
- Gold prices (world XAU + Antam) live in `src/lib/assets.server.ts`, cached one row per day per source in `gold_prices` with last-cache then estimate fallback; pure gold/receivable math lives in `src/lib/assets.ts`.
- Linked receivables move money as expense/income transactions in category "Piutang"; net worth adds outstanding linked receivables and gold value back so they count as assets.
- After CRUD, invalidate via `invalidateFor(qc, table)` (table→query-key map in queries.ts), never a blanket `invalidateQueries()`.
- Activity labels come from `src/lib/activity.ts`; action names are `<table>.<create|update|delete>` or the special keys listed there.
- Fees: transfer/top-up/monthly account fees are separate expense transactions in category "Biaya Admin"; monthly fees are applied lazily (dashboard/reminders) and deduplicated by a notes marker from `src/lib/fees.ts` (pure, tested). Optional v4 columns are dropped and retried in saveRow when missing.
- Unbounded history screens use validated server-side pagination and sorting; compact dashboard widgets and small form reference lists stay bounded or fully loaded for usability.
- Gold records with an account create a linked expense (buy) / income (sell) transaction in category "Emas" via `saveGold` in assets.server.ts (pure helpers in assets.ts); edits sync and deletes remove it, and net worth counts gold value once against the cash outflow.
- Telegram bot logic lives in the web app, not n8n: pure parsing/UI (slash commands, quickParse, periods, inline keyboards, callback parsing) in `src/lib/bot.ts` (tested), DB work in `src/lib/bot.server.ts`; n8n only forwards updates to `POST /api/public/n8n/bot` and relays `{method,text,reply_markup}` to the Telegram Bot API.
- Bot transactions are always previewed as `bot_drafts` rows and saved on ✅ via `createFromExternal` with `external_id = draft:<id>` (unique index) so retries/double taps are idempotent; AI output is snapped onto existing categories/accounts by `matchCategory` and never creates categories.
- Token budget: chat goes quickParse → keyword/history category → AI only when ambiguous (`BOT_TEXT_AI`); `AI_MODEL_TEXT` can point chat parsing at a cheaper model than OCR.
