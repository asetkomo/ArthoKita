/** Pure builder for reminder emails (shared by n8n endpoint and direct send). */
export type EmailReminder = {
  type: string;
  title: string;
  amount: number;
  currency: string;
  due_date: string;
  days_left: number;
  overdue: boolean;
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number, c: string) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: c,
    maximumFractionDigits: c === "USD" ? 2 : 0,
  }).format(n);

function when(r: EmailReminder): string {
  if (r.type === "budget") return "Peringatan budget";
  if (r.overdue) return `Terlambat ${-r.days_left} hari`;
  if (r.days_left === 0) return "Hari ini";
  return `${r.days_left} hari lagi (${r.due_date})`;
}

export function buildReminderEmail(list: EmailReminder[]) {
  const overdue = list.filter((r) => r.overdue).length;
  const subject = list.length
    ? `🔔 Dompetku: ${list.length} pengingat${overdue ? ` (${overdue} terlambat)` : ""}`
    : "🎉 Dompetku: tidak ada tagihan dalam waktu dekat";
  const text = list.length
    ? `Pengingat Keuangan\n\n${list.map((r) => `• ${r.title}: ${fmt(r.amount, r.currency)} — ${when(r)}`).join("\n")}`
    : "Tidak ada tagihan dalam waktu dekat.";
  const rows = list
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e6e1d3">${esc(r.title)}</td><td style="padding:8px 12px;border-bottom:1px solid #e6e1d3;font-family:monospace;text-align:right">${esc(fmt(r.amount, r.currency))}</td><td style="padding:8px 12px;border-bottom:1px solid #e6e1d3;color:${r.overdue ? "#b5452b" : "#4d5f57"}">${esc(when(r))}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,sans-serif;background:#f7f3ea;padding:24px;color:#1f3029"><div style="max-width:600px;margin:auto;background:#fdfbf6;border-radius:14px;padding:24px"><h2 style="margin:0 0 4px">Dompetku<span style="color:#e3b23c">.</span></h2><p style="margin:0 0 16px;color:#4d5f57">Pengingat keuangan Anda</p>${list.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` : "<p>🎉 Tidak ada tagihan dalam waktu dekat.</p>"}</div></div>`;
  return { subject, text, html };
}
