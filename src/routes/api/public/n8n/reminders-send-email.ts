import { createFileRoute } from "@tanstack/react-router";
import { reportServerError, withErrorLogging } from "@/lib/monitoring";
import { z } from "zod";

// POST /api/public/n8n/reminders-send-email { days?, to? } — send reminders directly via Resend (optional env).
const body = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
  to: z.string().email().optional(),
  skipIfEmpty: z.boolean().default(true),
});

export const Route = createFileRoute("/api/public/n8n/reminders-send-email")({
  server: {
    handlers: {
      POST: withErrorLogging("n8n:reminders-send-email", async ({ request }) => {
        const { checkApiKey, json } = await import("@/lib/api-key.server");
        const denied = checkApiKey(request);
        if (denied) return denied;
        const parsed = body.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success)
          return json({ ok: false, error: "Input tidak valid", issues: parsed.error.issues }, 400);
        try {
          const { computeReminders, sendReminderEmail } = await import("@/lib/finance.server");
          if (parsed.data.skipIfEmpty && (await computeReminders(parsed.data.days)).length === 0) {
            return json({
              ok: true,
              sent: false,
              message: "Tidak ada pengingat, email tidak dikirim.",
            });
          }
          const r = await sendReminderEmail(parsed.data.days, parsed.data.to);
          return json(
            {
              ok: r.sent,
              ...r,
              message: r.sent ? `📧 Email pengingat terkirim (${r.count} item).` : r.reason,
            },
            r.sent ? 200 : 503,
          );
        } catch (e) {
          await reportServerError("n8n:reminders-send-email", e, request);
          return json({ ok: false, error: e instanceof Error ? e.message : "Gagal" }, 500);
        }
      }),
    },
  },
});
