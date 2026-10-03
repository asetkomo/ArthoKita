/** Human-readable labels for activity_log actions (client-safe, unit-tested). Labels are Indonesian i18n keys. */
const ENTITY: Record<string, string> = {
  transaction: "Transaksi",
  transactions: "Transaksi",
  accounts: "Akun",
  categories: "Kategori",
  debts: "Hutang",
  subscriptions: "Langganan",
  budgets: "Budget",
  goals: "Target",
  gold_purchases: "Emas",
  receivables: "Piutang",
};

const VERB: Record<string, string> = {
  create: "ditambahkan",
  update: "diubah",
  delete: "dihapus",
};

const SPECIAL: Record<string, string> = {
  "debt.pay": "Cicilan dibayar",
  "debt_payment.delete": "Pembayaran cicilan dibatalkan",
  "subscription.pay": "Langganan ditandai sudah bayar",
  "receivable.pay": "Pembayaran piutang diterima",
  "receivable.settle": "Piutang ditandai lunas",
  "receivable.reopen": "Piutang dibuka kembali",
  "receivable_payment.delete": "Pembayaran piutang dibatalkan",
  "goal.funds": "Dana target diperbarui",
  import: "Impor CSV",
  "backup.export": "Cadangan diunduh",
  "auth.login": "Login berhasil",
  "auth.login_failed": "Login gagal",
  "auth.logout": "Logout",
  "bot.command": "Perintah bot",
};

export function activityLabel(action: string, t: (s: string) => string = (s) => s): string {
  if (SPECIAL[action]) return t(SPECIAL[action]!);
  const [entity, verb] = action.split(".");
  if (entity && verb && ENTITY[entity] && VERB[verb]) return `${t(ENTITY[entity]!)} ${t(VERB[verb]!)}`;
  return action;
}

/** Short detail suffix: name/description and formatted amount when present. */
export function activityDetail(detail: unknown, fmt: (n: number, c: string) => string): string {
  if (!detail || typeof detail !== "object") return "";
  const d = detail as Record<string, unknown>;
  const parts: string[] = [];
  const name = d["name"] ?? d["description"] ?? d["text"];
  if (typeof name === "string" && name) parts.push(name);
  const amt = Number(d["amount"]);
  if (Number.isFinite(amt) && amt > 0 && d["amount"] != null) parts.push(fmt(amt, typeof d["currency"] === "string" ? (d["currency"] as string) : "IDR"));
  if (typeof d["from"] === "string" && typeof d["to"] === "string") parts.push(`${d["from"]} → ${d["to"]}`);
  if (typeof d["imported"] === "number") parts.push(`${d["imported"]} baris`);
  return parts.join(" · ");
}
