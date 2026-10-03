import { createFileRoute } from "@tanstack/react-router";

// GET /api/public/n8n/reminders?days=7 — upcoming installments, subscriptions & budget alerts.
export const Route = createFileRoute("/api/public/n8n/reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { checkApiKey, json } = await import("@/lib/api-key.server");
        const denied = checkApiKey(request);
        if (denied) return denied;
        const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days") ?? 7) || 7));
        try {
          const { computeReminders, remindersText } = await import("@/lib/finance.server");
          const reminders = await computeReminders(days);
          return json({ ok: true, count: reminders.length, reminders, message: remindersText(reminders) });
        } catch (e) {
          console.error(e);
          return json({ ok: false, error: e instanceof Error ? e.message : "Gagal" }, 500);
        }
      },
    },
  },
});
