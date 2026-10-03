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
