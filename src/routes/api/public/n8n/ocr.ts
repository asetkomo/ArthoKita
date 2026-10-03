import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/public/n8n/ocr — { image_base64, mime_type?: "image/jpeg", save?: true, source?: "telegram", account?: "BCA" }
const schema = z.object({
  image_base64: z.string().min(100).max(10_000_000),
  mime_type: z.string().regex(/^image\/[a-z+.-]+$/).default("image/jpeg"),
  save: z.boolean().default(true),
  source: z.enum(["telegram", "whatsapp", "n8n", "ocr"]).default("ocr"),
  account: z.string().max(80).nullable().optional(),
});

export const Route = createFileRoute("/api/public/n8n/ocr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkApiKey, json } = await import("@/lib/api-key.server");
        const denied = checkApiKey(request);
        if (denied) return denied;
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: parsed.error.flatten() }, 400);
        try {
          const { parseReceipt } = await import("@/lib/ocr.server");
          const { categoryNames, createFromExternal } = await import("@/lib/finance.server");
          const b64 = parsed.data.image_base64.replace(/^data:[^,]+,/, "");
          const draft = await parseReceipt(`data:${parsed.data.mime_type};base64,${b64}`, await categoryNames());
          if (!draft.amount || draft.amount <= 0) return json({ ok: false, draft, message: "❓ Total nota tidak terbaca, coba foto lebih jelas." }, 422);
          if (!parsed.data.save) return json({ ok: true, draft });
          const r = await createFromExternal({
            kind: draft.kind, amount: draft.amount, currency: draft.currency, category: draft.category,
            account: parsed.data.account ?? null, description: draft.description, merchant: draft.merchant,
            date: draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : null, source: parsed.data.source,
            items: draft.items.length ? draft.items : null, raw: { ocr: draft },
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
