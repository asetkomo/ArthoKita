import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/public/n8n/message — { text: "makan siang 25rb", save?: true, source?: "telegram", account?: "GoPay" }
const schema = z.object({
  text: z.string().min(1).max(1000),
  save: z.boolean().default(true),
  source: z.enum(["telegram", "whatsapp", "n8n"]).default("telegram"),
  account: z.string().max(80).nullable().optional(),
});

export const Route = createFileRoute("/api/public/n8n/message")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkApiKey, json } = await import("@/lib/api-key.server");
        const denied = checkApiKey(request);
        if (denied) return denied;
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: parsed.error.flatten() }, 400);
        try {
          const { parseText } = await import("@/lib/ocr.server");
          const { categoryNames, createFromExternal, today } = await import("@/lib/finance.server");
          const draft = await parseText(parsed.data.text, await categoryNames(), today());
          if (!draft.amount || draft.amount <= 0) return json({ ok: false, draft, message: "❓ Nominal tidak terbaca. Contoh: 'kopi 25rb'" }, 422);
          if (!parsed.data.save) return json({ ok: true, draft });
          const r = await createFromExternal({
            kind: draft.kind, amount: draft.amount, currency: draft.currency, category: draft.category,
            account: parsed.data.account ?? null, description: draft.description ?? parsed.data.text, merchant: draft.merchant,
            date: draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : null, source: parsed.data.source,
            items: draft.items.length ? draft.items : null, raw: { text: parsed.data.text },
          });
          return json({ ok: true, draft, ...r });
        } catch (e) {
          console.error(e);
          return json({ ok: false, error: e instanceof Error ? e.message : "Gagal" }, 500);
        }
      },
    },
  },
});
