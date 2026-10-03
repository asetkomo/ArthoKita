/** Pure text classification for n8n bot commands (client-safe, unit-testable). */

export type BotCommand =
  | { type: "balances" }
  | { type: "summary"; month: string | null }
  | { type: "reminders" }
  | { type: "pay"; target: string }
  | { type: "withdraw"; amount: number; from: string | null }
  | { type: "help" }
  | { type: "unknown" };

const STRIP = /[%,()]/g;

export function classifyBotCommand(raw: string): BotCommand {
  const text = raw.toLowerCase().trim();
  if (/^(saldo|cek saldo|balance|balances)\b/.test(text)) return { type: "balances" };
  if (/^(laporan|ringkasan|summary|report)\b/.test(text)) {
    const m = text.match(/\d{4}-\d{2}/);
    return { type: "summary", month: m ? m[0]! : null };
  }
  if (/^(pengingat|reminders?|tagihan)\b/.test(text)) return { type: "reminders" };
  if (/^(sudah dibayar|sudah bayar|bayar|paid|pay)\b/.test(text)) {
    const target = text.replace(/^(sudah dibayar|sudah bayar|bayar|paid|pay)\b/, "").trim();
    return { type: "pay", target };
  }
  const w = text.match(/^(tarik tunai|tarik|ambil tunai|atm|withdraw)\s+([\d.,]+)\s*(rb|ribu|k|jt|juta|m)?(?:\s+(?:dari|from)\s+(.+))?$/);
  if (w) return { type: "withdraw", amount: parseAmount(w[2]!, w[3]), from: w[4]?.trim() || null };
  if (/^(bantuan|help|menu)\b/.test(text)) return { type: "help" };
  return { type: "unknown" };
}

export function botHelp(): string {
  return [
    "🤖 Perintah yang dikenali:",
    "• saldo — cek saldo semua akun",
    "• laporan [YYYY-MM] — ringkasan bulanan",
    "• pengingat — tagihan 14 hari ke depan",
    "• sudah bayar <nama> — catat pembayaran langganan/cicilan",
    "• tarik tunai <nominal> [dari <akun>] — catat tarik tunai ATM",
    "Catat pengeluaran bebas tetap bisa: 'kopi 25rb'.",
  ].join("\n");
}

export function botSearchToken(target: string): string {
  return target.replace(STRIP, "").trim();
}

/** "500rb" → 500000, "1,5jt" → 1500000, "250.000" → 250000. */
export function parseAmount(num: string, unit?: string): number {
  const mult = !unit ? 1 : /^(rb|ribu|k)$/.test(unit) ? 1_000 : 1_000_000;
  const n = unit ? Number(num.replace(/\./g, "").replace(",", ".")) : Number(num.replace(/[.,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}
