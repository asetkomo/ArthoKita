import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// POST /api/public/n8n/bot — satu pintu untuk semua update Telegram dari n8n.
// Body: { update_id, chat_id, text?, image_base64?, mime_type?, callback_data? }
// Balasan: { ok, method: "send"|"edit"|"none", text, reply_markup, toast? } → n8n tinggal meneruskan ke Telegram Bot API.
const schema = z
  .object({
    update_id: z.coerce.number().int().nonnegative(),
    chat_id: z.coerce.string().regex(/^-?\d{1,20}$/),
    text: z.string().max(2000).nullable().optional(),
    // Vercel membatasi body 4,5 MB.
    image_base64: z.string().min(100).max(4_400_000).nullable().optional(),
    mime_type: z
      .string()
      .regex(/^image\/[a-z+.-]+$/)
      .nullable()
      .optional(),
    callback_data: z.string().max(64).nullable().optional(),
  })
  .refine((v) => v.text || v.image_base64 || v.callback_data, {
    message: "text, image_base64, atau callback_data wajib diisi",
  });

export const Route = createFileRoute("/api/public/n8n/bot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { checkApiKey, json } = await import("@/lib/api-key.server");
        const denied = checkApiKey(request);
        if (denied) return denied;
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return json({ ok: false, error: parsed.error.flatten(), method: "none" }, 400);
        try {
          const { handleBotUpdate } = await import("@/lib/bot.server");
          const r = await handleBotUpdate(parsed.data);
          return json({ ok: true, ...r });
        } catch (e) {
          console.error(e);
          const msg = e instanceof Error ? e.message : "Gagal";
          // Tetap 200 agar n8n bisa mengirim pesan error yang ramah ke pengguna.
          return json({
            ok: false,
            error: msg,
            method: parsed.data.callback_data ? "edit" : "send",
            text: `⚠️ ${msg}`,
            reply_markup: null,
          });
        }
      },
    },
  },
});
