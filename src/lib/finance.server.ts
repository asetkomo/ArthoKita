import { db } from "./db.server";
import { addDays, addMonthsKeepDay, diffDays, monthRange, shiftMonth, todayStr } from "./dates";
import type { ExternalTx, TransactionInput } from "./schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res<T> = { data: T | null; error: { message: string } | null };
function must<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const today = () => todayStr(process.env["APP_TIMEZONE"] || "Asia/Jakarta");
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------- FX ---------------- */
export async function getUsdIdr(): Promise<number> {
  const d = today();
  const cached = await db().from("fx_rates").select("rate").eq("rate_date", d).eq("base", "USD").eq("quote", "IDR").maybeSingle();
  if (cached.data) return Number(cached.data.rate);
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const j: any = await res.json();
    const rate = Number(j?.rates?.IDR);
    if (rate > 0) {
      await db().from("fx_rates").upsert({ rate_date: d, base: "USD", quote: "IDR", rate });
      return rate;
    }
  } catch (e) {
    console.error("FX fetch failed", e);
  }
  const last = await db().from("fx_rates").select("rate").order("rate_date", { ascending: false }).limit(1).maybeSingle();
  return last.data ? Number(last.data.rate) : Number(process.env["FALLBACK_USD_IDR"] || 16000);
}

async function toIdr(amount: number, currency: string, rate?: number): Promise<number> {
  if (currency !== "USD") return r2(amount);
  return r2(amount * (rate ?? (await getUsdIdr())));
}

/* ---------------- Lookups ---------------- */
export async function ensureCategory(name: string, kind: "income" | "expense"): Promise<string> {
  const found = await db().from("categories").select("id").ilike("name", name.trim()).eq("kind", kind).limit(1).maybeSingle();
  if (found.data) return found.data.id as string;
  const created = must<any>(await db().from("categories").insert({ name: name.trim(), kind }).select("id").single());
  return created.id;
}

async function findAccount(name?: string | null): Promise<string | null> {
  if (!name) return null;
  const r = await db().from("accounts").select("id").ilike("name", `%${name.replace(/[%,()]/g, "").trim()}%`).limit(1).maybeSingle();
  return (r.data?.id as string) ?? null;
}

/* ---------------- Transactions ---------------- */
function normalizeTx(input: TransactionInput) {
  return {
    ...input,
    category_id: input.kind === "transfer" ? null : input.category_id,
    to_account_id: input.kind === "transfer" ? input.to_account_id : null,
  };
}

export async function insertTransaction(input: TransactionInput, raw?: unknown) {
  const row = { ...normalizeTx(input), amount_idr: await toIdr(input.amount, input.currency), raw: raw ?? null };
  return must<any>(await db().from("transactions").insert(row).select().single());
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const row = { ...normalizeTx(input), amount_idr: await toIdr(input.amount, input.currency) };
  return must<any>(await db().from("transactions").update(row).eq("id", id).select().single());
}

export async function createFromExternal(t: ExternalTx) {
  const category_id = t.kind !== "transfer" && t.category ? await ensureCategory(t.category, t.kind) : null;
  const input: TransactionInput = {
    kind: t.kind,
    amount: t.amount,
    currency: t.currency,
    account_id: await findAccount(t.account),
    to_account_id: t.kind === "transfer" ? await findAccount(t.to_account) : null,
    category_id,
    description: t.description ?? null,
    merchant: t.merchant ?? null,
    occurred_at: t.date ?? today(),
    source: t.source,
    items: t.items ?? null,
    notes: t.notes ?? null,
  };
  const tx = await insertTransaction(input, t.raw);
  const label = t.kind === "income" ? "Pemasukan" : t.kind === "expense" ? "Pengeluaran" : "Transfer";
  const amountText = new Intl.NumberFormat("id-ID", { style: "currency", currency: t.currency, maximumFractionDigits: t.currency === "USD" ? 2 : 0 }).format(t.amount);
  const message = `✅ Tercatat: ${label} ${amountText}${t.category ? ` • ${t.category}` : ""}${t.description || t.merchant ? ` • ${t.description ?? t.merchant}` : ""}`;
  return { transaction: tx, message };
}

export type TxFilters = { month?: string | undefined; kind?: string | undefined; search?: string | undefined; category_id?: string | undefined; account_id?: string | undefined; limit?: number | undefined };

export async function listTransactions(f: TxFilters) {
  let q = db()
    .from("transactions")
    .select(
      "*, category:categories(id,name,color), account:accounts!transactions_account_id_fkey(id,name), to_account:accounts!transactions_to_account_id_fkey(id,name)",
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(f.limit ?? 500);
  if (f.month) {
    const { start, end } = monthRange(f.month);
    q = q.gte("occurred_at", start).lt("occurred_at", end);
  }
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.category_id) q = q.eq("category_id", f.category_id);
  if (f.account_id) q = q.or(`account_id.eq.${f.account_id},to_account_id.eq.${f.account_id}`);
  if (f.search) {
    const s = f.search.replace(/[%,()*]/g, "").trim();
    if (s) q = q.or(`description.ilike.%${s}%,merchant.ilike.%${s}%,notes.ilike.%${s}%`);
  }
  return must<any[]>(await q);
}

export async function exportCsv(month?: string) {
  const rows = await listTransactions({ month, limit: 10000 });
  const head = ["Tanggal", "Jenis", "Kategori", "Akun", "Ke Akun", "Deskripsi", "Merchant", "Jumlah", "Mata Uang", "Jumlah IDR", "Sumber", "Catatan"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.occurred_at, r.kind, r.category?.name, r.account?.name, r.to_account?.name, r.description, r.merchant, r.amount, r.currency, r.amount_idr, r.source, r.notes]
      .map(esc)
      .join(","),
  );
  return [head.map(esc).join(","), ...lines].join("\n");
}

/* ---------------- Budgets ---------------- */
export async function computeBudgets(month: string) {
  const { start, end } = monthRange(month);
  const budgets = must<any[]>(await db().from("budgets").select("*, category:categories(id,name,color)"));
  const tx = must<any[]>(await db().from("transactions").select("category_id, amount_idr").eq("kind", "expense").gte("occurred_at", start).lt("occurred_at", end));
  const spent = new Map<string, number>();
  for (const t of tx) if (t.category_id) spent.set(t.category_id, (spent.get(t.category_id) ?? 0) + Number(t.amount_idr));
  return budgets.map((b) => {
    const amount = Number(b.amount);
    const s = spent.get(b.category_id) ?? 0;
    return { id: b.id as string, category_id: b.category_id as string, category: (b.category?.name ?? "-") as string, color: (b.category?.color ?? null) as string | null, amount, alert_percent: Number(b.alert_percent), spent: s, percent: amount ? (s / amount) * 100 : 0 };
  });
}

/* ---------------- Debts ---------------- */
export async function computeDebts() {
  const debts = must<any[]>(await db().from("debts").select("*").order("created_at"));
  const pays = must<any[]>(await db().from("debt_payments").select("*").order("installment_no"));
  return debts.map((d) => {
    const payments = pays.filter((p) => p.debt_id === d.id);
    const paid = payments.length;
    const total = Number(d.total_installments);
    const remaining = Math.max(0, total - paid);
    const next_due = remaining > 0 && d.status === "active" ? addMonthsKeepDay(String(d.start_date).slice(0, 7) + "-01", paid, Number(d.due_day)) : null;
    return {
      ...d,
      total_amount: Number(d.total_amount),
      installment_amount: Number(d.installment_amount),
      paid_count: paid,
      remaining_count: remaining,
      remaining_amount: remaining * Number(d.installment_amount),
      paid_amount: payments.reduce((a, p) => a + Number(p.amount), 0),
      next_due,
      payments: payments.map((p) => ({ id: p.id as string, installment_no: p.installment_no as number, amount: Number(p.amount), paid_at: p.paid_at as string })),
    };
  });
}

export async function payDebt(debtId: string, accountId: string | null, date: string | null) {
  const d = must<any>(await db().from("debts").select("*").eq("id", debtId).single());
  const { count } = await db().from("debt_payments").select("id", { count: "exact", head: true }).eq("debt_id", debtId);
  const paid = count ?? 0;
  if (paid >= d.total_installments) throw new Error("Hutang ini sudah lunas.");
  const cat = await ensureCategory("Cicilan & Hutang", "expense");
  const tx = await insertTransaction({
    kind: "expense",
    amount: Number(d.installment_amount),
    currency: d.currency,
    account_id: accountId ?? d.account_id ?? null,
    to_account_id: null,
    category_id: cat,
    description: `Cicilan ${d.name} ke-${paid + 1}/${d.total_installments}`,
    merchant: d.provider ?? null,
    occurred_at: date ?? today(),
    source: "web",
    items: null,
    notes: null,
  });
  must(await db().from("debt_payments").insert({ debt_id: debtId, installment_no: paid + 1, amount: d.installment_amount, paid_at: date ?? today(), transaction_id: tx.id }));
  if (paid + 1 >= d.total_installments) await db().from("debts").update({ status: "paid_off" }).eq("id", debtId);
  return { ok: true };
}

export async function deleteDebtPayment(id: string) {
  const p = must<any>(await db().from("debt_payments").select("*").eq("id", id).single());
  must(await db().from("debt_payments").delete().eq("id", id));
  if (p.transaction_id) await db().from("transactions").delete().eq("id", p.transaction_id);
  await db().from("debts").update({ status: "active" }).eq("id", p.debt_id);
}

/* ---------------- Subscriptions ---------------- */
export async function paySubscription(id: string, accountId: string | null, date: string | null) {
  const s = must<any>(await db().from("subscriptions").select("*").eq("id", id).single());
  const cat = s.category_id ?? (await ensureCategory("Langganan", "expense"));
  await insertTransaction({
    kind: "expense",
    amount: Number(s.amount),
    currency: s.currency,
    account_id: accountId ?? s.account_id ?? null,
    to_account_id: null,
    category_id: cat,
    description: `Langganan ${s.name}`,
    merchant: s.name,
    occurred_at: date ?? today(),
    source: "web",
    items: null,
    notes: null,
  });
  const next = addMonthsKeepDay(s.next_due, s.cycle === "yearly" ? 12 : 1);
  must(await db().from("subscriptions").update({ next_due: next }).eq("id", id));
  return { ok: true, next_due: next };
}

/* ---------------- Reminders ---------------- */
export type Reminder = {
  type: "debt" | "subscription" | "budget";
  id: string;
  title: string;
  amount: number;
  currency: string;
  amount_idr: number;
  due_date: string;
  days_left: number;
  overdue: boolean;
};

export async function computeReminders(days = 30): Promise<Reminder[]> {
  const t = today();
  const limit = addDays(t, days);
  const rate = await getUsdIdr();
  const out: Reminder[] = [];
  for (const d of await computeDebts()) {
    if (!d.next_due || d.next_due > limit) continue;
    out.push({ type: "debt", id: d.id, title: `Cicilan ${d.name} (${d.paid_count + 1}/${d.total_installments})`, amount: d.installment_amount, currency: d.currency, amount_idr: await toIdr(d.installment_amount, d.currency, rate), due_date: d.next_due, days_left: diffDays(t, d.next_due), overdue: d.next_due < t });
  }
  const subs = must<any[]>(await db().from("subscriptions").select("*").eq("active", true).lte("next_due", limit));
  for (const s of subs) {
    out.push({ type: "subscription", id: s.id, title: `Langganan ${s.name} (${s.cycle === "yearly" ? "tahunan" : "bulanan"})`, amount: Number(s.amount), currency: s.currency, amount_idr: await toIdr(Number(s.amount), s.currency, rate), due_date: s.next_due, days_left: diffDays(t, s.next_due), overdue: s.next_due < t });
  }
  for (const b of await computeBudgets(t.slice(0, 7))) {
    if (b.percent >= b.alert_percent) {
      out.push({ type: "budget", id: b.id, title: `Budget ${b.category} terpakai ${Math.round(b.percent)}%`, amount: b.spent, currency: "IDR", amount_idr: b.spent, due_date: t, days_left: 0, overdue: b.percent >= 100 });
    }
  }
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export function remindersText(list: Reminder[]): string {
  if (!list.length) return "🎉 Tidak ada tagihan dalam waktu dekat.";
  const fmt = (n: number, c: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: c, maximumFractionDigits: c === "USD" ? 2 : 0 }).format(n);
  const lines = list.map((r) => {
    const when = r.type === "budget" ? "" : r.overdue ? ` — TERLAMBAT ${-r.days_left} hari` : r.days_left === 0 ? " — HARI INI" : ` — ${r.days_left} hari lagi (${r.due_date})`;
    return `• ${r.title}: ${fmt(r.amount, r.currency)}${when}`;
  });
  return `🔔 Pengingat Keuangan\n${lines.join("\n")}`;
}

/* ---------------- Dashboard ---------------- */
export async function computeDashboard(month: string) {
  const { start, end } = monthRange(month);
  const trendStart = monthRange(shiftMonth(month, -5)).start;
  const [txRes, trendRes, balRes, goalsRes, subsRes, recentRes] = await Promise.all([
    db().from("transactions").select("kind, amount_idr, category_id, category:categories(name,color)").gte("occurred_at", start).lt("occurred_at", end),
    db().from("transactions").select("kind, amount_idr, occurred_at, category:categories(name)").gte("occurred_at", trendStart).lt("occurred_at", end).neq("kind", "transfer"),
    db().from("account_balances").select("*").eq("archived", false),
    db().from("goals").select("*").order("created_at"),
    db().from("subscriptions").select("amount, currency, cycle").eq("active", true),
    db().from("transactions").select("*, category:categories(name,color), account:accounts!transactions_account_id_fkey(name)").order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).limit(8),
  ]);
  const tx = must<any[]>(txRes);
  const rate = await getUsdIdr();
  let income = 0;
  let expense = 0;
  const byCat = new Map<string, { name: string; color: string | null; value: number }>();
  for (const t of tx) {
    const v = Number(t.amount_idr);
    if (t.kind === "income") income += v;
    if (t.kind === "expense") {
      expense += v;
      const key = t.category_id ?? "none";
      const cur = byCat.get(key) ?? { name: t.category?.name ?? "Tanpa kategori", color: t.category?.color ?? null, value: 0 };
      cur.value += v;
      byCat.set(key, cur);
    }
  }
  const trendMap = new Map<string, { month: string; income: number; expense: number }>();
  for (let i = 5; i >= 0; i--) {
    const m = shiftMonth(month, -i);
    trendMap.set(m, { month: m, income: 0, expense: 0 });
  }
  const catTotals = new Map<string, number>();
  const catByMonth = new Map<string, Map<string, number>>();
  for (const t of must<any[]>(trendRes)) {
    const m = String(t.occurred_at).slice(0, 7);
    const row = trendMap.get(m);
    if (!row) continue;
    const v = Number(t.amount_idr);
    if (t.kind === "income") {
      row.income += v;
    } else {
      row.expense += v;
      const name = (t.category?.name ?? "Tanpa kategori") as string;
      catTotals.set(name, (catTotals.get(name) ?? 0) + v);
      const mm = catByMonth.get(m) ?? new Map<string, number>();
      mm.set(name, (mm.get(name) ?? 0) + v);
      catByMonth.set(m, mm);
    }
  }
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name);
  const categoryTrend = [...trendMap.keys()].map((m) => {
    const row: Record<string, number | string> = { month: m };
    const mm = catByMonth.get(m);
    for (const c of topCats) row[c] = mm?.get(c) ?? 0;
    return row;
  });
  const balances = must<any[]>(balRes).map((b) => ({ ...b, balance: Number(b.balance), balance_idr: b.currency === "USD" ? Number(b.balance) * rate : Number(b.balance) }));
  const debts = await computeDebts();
  const debtOutstandingIdr = debts.filter((d) => d.status === "active").reduce((a, d) => a + (d.currency === "USD" ? d.remaining_amount * rate : d.remaining_amount), 0);
  const subsMonthlyIdr = must<any[]>(subsRes).reduce((a, s) => {
    const v = Number(s.amount) * (s.currency === "USD" ? rate : 1);
    return a + (s.cycle === "yearly" ? v / 12 : v);
  }, 0);
  return {
    month,
    usdIdr: rate,
    income,
    expense,
    net: income - expense,
    byCategory: [...byCat.values()].sort((a, b) => b.value - a.value),
    trend: [...trendMap.values()],
    categoryTrend: { categories: topCats, rows: categoryTrend },
    balances,
    totalBalanceIdr: balances.reduce((a, b) => a + b.balance_idr, 0),
    debtOutstandingIdr,
    subsMonthlyIdr,
    budgets: await computeBudgets(month),
    reminders: (await computeReminders(14)).slice(0, 6),
    recent: must<any[]>(recentRes),
    goals: must<any[]>(goalsRes).map((g) => ({ ...g, target_amount: Number(g.target_amount), saved_amount: Number(g.saved_amount) })),
  };
}

export async function summaryText(month: string): Promise<string> {
  const d = await computeDashboard(month);
  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  const top = d.byCategory.slice(0, 5).map((c) => `  • ${c.name}: ${fmt(c.value)}`).join("\n");
  return `📊 Ringkasan ${month}\nPemasukan: ${fmt(d.income)}\nPengeluaran: ${fmt(d.expense)}\nSelisih: ${fmt(d.net)}\nTotal saldo: ${fmt(d.totalBalanceIdr)}\nSisa hutang: ${fmt(d.debtOutstandingIdr)}${top ? `\nPengeluaran terbesar:\n${top}` : ""}`;
}

export async function categoryNames(): Promise<string[]> {
  const rows = must<any[]>(await db().from("categories").select("name, kind"));
  return rows.map((r) => `${r.name} (${r.kind})`);
}

/* ---------------- Yearly recap ---------------- */
export async function computeYearly(year: string) {
  const start = `${year}-01-01`;
  const end = `${Number(year) + 1}-01-01`;
  const rows = must<any[]>(
    await db().from("transactions").select("kind, amount_idr, occurred_at, category:categories(name,color)").gte("occurred_at", start).lt("occurred_at", end).neq("kind", "transfer"),
  );
  const months = new Map<string, { month: string; income: number; expense: number }>();
  for (let i = 1; i <= 12; i++) months.set(`${year}-${String(i).padStart(2, "0")}`, { month: `${year}-${String(i).padStart(2, "0")}`, income: 0, expense: 0 });
  const byCat = new Map<string, { name: string; color: string | null; value: number }>();
  let income = 0;
  let expense = 0;
  for (const t of rows) {
    const v = Number(t.amount_idr);
    const row = months.get(String(t.occurred_at).slice(0, 7));
    if (t.kind === "income") {
      income += v;
      if (row) row.income += v;
    } else if (t.kind === "expense") {
      expense += v;
      if (row) row.expense += v;
      const name = (t.category?.name ?? "Tanpa kategori") as string;
      const cur = byCat.get(name) ?? { name, color: (t.category?.color ?? null) as string | null, value: 0 };
      cur.value += v;
      byCat.set(name, cur);
    }
  }
  return {
    year,
    income,
    expense,
    net: income - expense,
    avgIncome: income / 12,
    avgExpense: expense / 12,
    months: [...months.values()],
    byCategory: [...byCat.values()].sort((a, b) => b.value - a.value),
  };
}

/* ---------------- Email reminders (via n8n) ---------------- */
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function remindersEmail(list: Reminder[]): { subject: string; text: string; html: string } {
  const t = today();
  const subject = list.length ? `Pengingat Keuangan: ${list.length} tagihan (${t})` : `Tidak ada tagihan dekat (${t})`;
  const text = remindersText(list);
  const fmt = (n: number, c: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: c, maximumFractionDigits: c === "USD" ? 2 : 0 }).format(n);
  const items = list
    .map((r) => {
      const when = r.type === "budget" ? "Peringatan budget" : r.overdue ? `Terlambat ${-r.days_left} hari` : r.days_left === 0 ? "Hari ini" : `${r.days_left} hari lagi (${r.due_date})`;
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee">${escHtml(r.title)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-family:monospace">${escHtml(fmt(r.amount, r.currency))}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:${r.overdue ? "#c0392b" : "#666"}">${escHtml(when)}</td></tr>`;
    })
    .join("");
  const html = list.length
    ? `<div style="font-family:sans-serif;max-width:560px;margin:auto"><h2 style="color:#1d3b2f">Pengingat Keuangan</h2><table style="width:100%;border-collapse:collapse;font-size:14px">${items}</table><p style="color:#999;font-size:12px">Dikirim otomatis oleh Dompetku via n8n.</p></div>`
    : `<div style="font-family:sans-serif"><p>🎉 Tidak ada tagihan dalam waktu dekat.</p></div>`;
  return { subject, text, html };
}

/* ---------------- CSV import ---------------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      rows.push(cur); cur = [];
    } else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function parseAmount(s: string): number {
  const cleaned = s.replace(/[^\d.,-]/g, "");
  // "1.234.567,89" (id) or "1234567.89" (raw export)
  const n = cleaned.includes(",") ? Number(cleaned.replace(/\./g, "").replace(",", ".")) : Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`jumlah "${s}" tidak valid`);
  return n;
}

/** Import CSV dengan format hasil ekspor (Tanggal, Jenis, Kategori, Akun, ...). */
export async function importCsv(text: string) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const head = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => head.indexOf(name);
  if (idx("tanggal") < 0 || idx("jenis") < 0 || idx("jumlah") < 0) {
    throw new Error("Format CSV tidak dikenali. Gunakan file hasil ekspor dengan kolom: Tanggal, Jenis, Kategori, Akun, Jumlah, Mata Uang, …");
  }
  let imported = 0;
  const errors: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.every((c) => !c.trim())) continue;
    try {
      const kind = r[idx("jenis")]?.trim() ?? "";
      if (kind !== "income" && kind !== "expense" && kind !== "transfer") throw new Error(`jenis "${kind}" tidak valid`);
      const date = r[idx("tanggal")]?.trim() ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`tanggal "${date}" tidak valid`);
      const currency = (r[idx("mata uang")]?.trim().toUpperCase() || "IDR") as "IDR" | "USD";
      if (currency !== "IDR" && currency !== "USD") throw new Error(`mata uang "${currency}" tidak valid`);
      await createFromExternal({
        kind,
        amount: parseAmount(r[idx("jumlah")] ?? ""),
        currency,
        category: r[idx("kategori")]?.trim() || null,
        account: r[idx("akun")]?.trim() || null,
        to_account: kind === "transfer" ? r[idx("ke akun")]?.trim() || null : null,
        description: r[idx("deskripsi")]?.trim() || null,
        merchant: r[idx("merchant")]?.trim() || null,
        date,
        source: "web",
        notes: r[idx("catatan")]?.trim() || null,
        raw: null,
      });
      imported++;
    } catch (e) {
      errors.push(`Baris ${i + 1}: ${e instanceof Error ? e.message : "gagal"}`);
    }
  }
  const message = `${imported} transaksi berhasil diimpor${errors.length ? `, ${errors.length} gagal` : ""}.`;
  return { imported, failed: errors.length, errors: errors.slice(0, 10), message };
}
