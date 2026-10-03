import { db } from "./db.server";
import { dueMonthlyFees, feeDate, FEE_CATEGORY, withTax } from "./fees";
import { addDays, addMonthsKeepDay, diffDays, monthRange, shiftMonth, todayStr } from "./dates";
import type { ExternalTx, TransactionInput } from "./schemas";
import { dupKey } from "./csv";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Res<T> = { data: T | null; error: { message: string } | null };
function must<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const today = () => todayStr(process.env["APP_TIMEZONE"] || "Asia/Jakarta");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** True when PostgREST reports a table that has not been created yet (schema v3 not run). */
export function isMissingTable(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "PGRST205" || err.code === "42P01" || /could not find the table|does not exist/i.test(err.message ?? "");
}

/* ---------------- Activity log ---------------- */
export async function logActivity(action: string, entity?: string | null, detail?: unknown) {
  try {
    const res = await db().from("activity_log").insert({ action, entity: entity ?? null, detail: detail ?? null });
    if (res.error && !isMissingTable(res.error)) console.error("activity log failed", res.error.message);
  } catch (e) {
    console.error("activity log failed", e);
  }
}

export async function listActivity(limit = 30) {
  try {
    const res = await db().from("activity_log").select("id, action, entity, detail, created_at").order("created_at", { ascending: false }).limit(limit);
    if (res.error) {
      if (!isMissingTable(res.error)) console.error("activity list failed", res.error.message);
      return [] as any[];
    }
    return (res.data ?? []) as any[];
  } catch (e) {
    console.error("activity list failed", e);
    return [] as any[];
  }
}


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
  const { fee: _fee, ...rest } = input;
  return {
    ...rest,
    category_id: input.kind === "transfer" ? null : input.category_id,
    to_account_id: input.kind === "transfer" ? input.to_account_id : null,
  };
}

// Kolom receipt_path mungkin belum ada di database user (migrasi opsional).
// Jika PostgREST menolak kolomnya, ulangi tanpa kolom itu agar fitur lain tetap jalan.
function isMissingReceiptColumn(err: { message?: string } | null) {
  return !!err?.message && err.message.includes("receipt_path");
}

async function insertTxRow(row: Record<string, unknown>) {
  const res = await db().from("transactions").insert(row).select().single();
  if (res.error && isMissingReceiptColumn(res.error)) {
    const { receipt_path: _drop, ...fallback } = row;
    return must<any>(await db().from("transactions").insert(fallback).select().single());
  }
  return must<any>(res);
}

export async function insertTransaction(input: TransactionInput, raw?: unknown) {
  const tx = await insertTxRow({ ...normalizeTx(input), amount_idr: await toIdr(input.amount, input.currency), raw: raw ?? null });
  const fee = Number(input.fee) || 0;
  if (fee > 0 && input.kind !== "income") {
    await insertTxRow({
      kind: "expense", amount: fee, currency: input.currency, amount_idr: await toIdr(fee, input.currency),
      account_id: input.account_id, to_account_id: null, category_id: await ensureCategory(FEE_CATEGORY, "expense"),
      description: `${input.kind === "transfer" ? "Biaya transfer" : "Biaya admin"}${input.description ? `: ${input.description}` : ""}`,
      merchant: null, occurred_at: input.occurred_at, source: input.source, items: null, notes: `[fee:${tx.id}]`, receipt_path: null, raw: null,
    });
  }
  await logActivity("transaction.create", "transactions", { kind: input.kind, amount: input.amount, currency: input.currency, description: input.description ?? null, source: input.source });
  return tx;
}

export async function updateTransaction(id: string, input: TransactionInput) {
  const row = { ...normalizeTx(input), amount_idr: await toIdr(input.amount, input.currency) };
  const res = await db().from("transactions").update(row).eq("id", id).select().single();
  let data: Record<string, unknown>;
  if (res.error && isMissingReceiptColumn(res.error)) {
    const { receipt_path: _drop, ...fallback } = row;
    data = must<any>(await db().from("transactions").update(fallback).eq("id", id).select().single());
  } else {
    data = must<any>(res);
  }
  await logActivity("transaction.update", "transactions", { kind: input.kind, amount: input.amount, currency: input.currency, description: input.description ?? null });
  return data as any;
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
    receipt_path: null,
  };
  const tx = await insertTransaction(input, t.raw);
  const label = t.kind === "income" ? "Pemasukan" : t.kind === "expense" ? "Pengeluaran" : "Transfer";
  const amountText = new Intl.NumberFormat("id-ID", { style: "currency", currency: t.currency, maximumFractionDigits: t.currency === "USD" ? 2 : 0 }).format(t.amount);
  const message = `✅ Tercatat: ${label} ${amountText}${t.category ? ` • ${t.category}` : ""}${t.description || t.merchant ? ` • ${t.description ?? t.merchant}` : ""}`;
  return { transaction: tx, message };
}

export type TxFilters = { month?: string | undefined; kind?: string | undefined; search?: string | undefined; category_id?: string | undefined; account_id?: string | undefined; limit?: number | undefined; offset?: number | undefined };

function applyTxFilters(q: any, f: TxFilters) {
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
  return q;
}

export async function listTransactions(f: TxFilters) {
  const limit = f.limit ?? 500;
  const offset = f.offset ?? 0;
  const q = db()
    .from("transactions")
    .select(
      "*, category:categories(id,name,color), account:accounts!transactions_account_id_fkey(id,name), to_account:accounts!transactions_to_account_id_fkey(id,name)",
    )
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return must<any[]>(await applyTxFilters(q, f));
}

export async function countTransactions(f: TxFilters) {
  const res = await applyTxFilters(db().from("transactions").select("id", { count: "exact", head: true }), f);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
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
    receipt_path: null,
  });
  must(await db().from("debt_payments").insert({ debt_id: debtId, installment_no: paid + 1, amount: d.installment_amount, paid_at: date ?? today(), transaction_id: tx.id }));
  if (paid + 1 >= d.total_installments) await db().from("debts").update({ status: "paid_off" }).eq("id", debtId);
  await logActivity("debt.pay", "debts", { name: d.name, amount: Number(d.installment_amount), currency: d.currency, installment: paid + 1 });
  return { ok: true };
}


export async function deleteDebtPayment(id: string) {
  const p = must<any>(await db().from("debt_payments").select("*").eq("id", id).single());
  const d = await db().from("debts").select("name, currency").eq("id", p.debt_id).maybeSingle();
  must(await db().from("debt_payments").delete().eq("id", id));
  if (p.transaction_id) await db().from("transactions").delete().eq("id", p.transaction_id);
  await db().from("debts").update({ status: "active" }).eq("id", p.debt_id);
  return { name: (d.data as any)?.name ?? null, amount: Number(p.amount), currency: (d.data as any)?.currency ?? "IDR", installment: p.installment_no };
}

/* ---------------- Subscriptions ---------------- */
export async function paySubscription(id: string, accountId: string | null, date: string | null) {
  const s = must<any>(await db().from("subscriptions").select("*").eq("id", id).single());
  const cat = s.category_id ?? (await ensureCategory("Langganan", "expense"));
  const total = withTax(Number(s.amount), s.tax_percent);
  await insertTransaction({
    kind: "expense",
    amount: total,
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
    receipt_path: null,
  });
  const next = addMonthsKeepDay(s.next_due, s.cycle === "yearly" ? 12 : 1);
  must(await db().from("subscriptions").update({ next_due: next }).eq("id", id));
  await logActivity("subscription.pay", "subscriptions", { name: s.name, amount: total, currency: s.currency });
  return { ok: true, next_due: next };
}


/* ---------------- Reminders ---------------- */
export type Reminder = {
  type: "debt" | "subscription" | "budget" | "fee";
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
  await applyMonthlyFees();
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
    const amt = withTax(Number(s.amount), s.tax_percent);
    out.push({ type: "subscription", id: s.id, title: `Langganan ${s.name} (${s.cycle === "yearly" ? "tahunan" : "bulanan"})`, amount: amt, currency: s.currency, amount_idr: await toIdr(amt, s.currency, rate), due_date: s.next_due, days_left: diffDays(t, s.next_due), overdue: s.next_due < t });
  }
  for (const a of must<any[]>(await db().from("accounts").select("*").eq("archived", false))) {
    if (!(Number(a.monthly_fee) > 0)) continue;
    let due = feeDate(t.slice(0, 7), Number(a.monthly_fee_day) || 1);
    if (due < t) due = feeDate(shiftMonth(t.slice(0, 7), 1), Number(a.monthly_fee_day) || 1);
    if (due > limit) continue;
    const amt = Number(a.monthly_fee);
    out.push({ type: "fee", id: a.id, title: `Biaya bulanan ${a.name} (otomatis)`, amount: amt, currency: a.currency, amount_idr: await toIdr(amt, a.currency, rate), due_date: due, days_left: diffDays(t, due), overdue: false });
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
/** Record due monthly account fees once per month (idempotent via notes marker). */
export async function applyMonthlyFees(): Promise<number> {
  const t = today();
  const accRes = await db().from("accounts").select("*");
  if (accRes.error) return 0;
  const candidates = (accRes.data ?? []).filter((a: any) => Number(a.monthly_fee) > 0);
  if (!candidates.length) return 0;
  const existing = await db().from("transactions").select("notes").like("notes", `[auto:monthly_fee:%:${t.slice(0, 7)}]`);
  const recorded = new Set<string>((existing.data ?? []).map((r: any) => String(r.notes)));
  const due = dueMonthlyFees(candidates as any[], t, recorded);
  if (!due.length) return 0;
  const cat = await ensureCategory(FEE_CATEGORY, "expense");
  for (const d of due) {
    const a: any = d.account;
    await insertTxRow({ kind: "expense", amount: Number(a.monthly_fee), currency: a.currency, amount_idr: await toIdr(Number(a.monthly_fee), a.currency), account_id: a.id, to_account_id: null, category_id: cat, description: `Biaya bulanan ${a.name}`, merchant: a.name, occurred_at: d.date, source: "web", items: null, notes: d.marker, receipt_path: null, raw: null });
    await logActivity("transaction.create", "transactions", { kind: "expense", amount: Number(a.monthly_fee), currency: a.currency, description: `Biaya bulanan ${a.name}`, source: "auto" });
  }
  return due.length;
}

export async function computeDashboard(month: string) {
  await applyMonthlyFees();
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
  const feesIdr = tx.filter((t) => t.kind === "expense" && t.category?.name === FEE_CATEGORY).reduce((a, t) => a + Number(t.amount_idr), 0);
  return {
    month,
    feesIdr,
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
  type Parsed = { line: number; row: string[]; kind: "income" | "expense" | "transfer"; date: string; currency: "IDR" | "USD"; amount: number; category: string | null; account: string | null; to_account: string | null; description: string | null; merchant: string | null; notes: string | null };
  const items: Parsed[] = [];
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
      items.push({
        line: i + 1,
        row: r,
        kind,
        date,
        currency,
        amount: parseAmount(r[idx("jumlah")] ?? ""),
        category: r[idx("kategori")]?.trim() || null,
        account: r[idx("akun")]?.trim() || null,
        to_account: kind === "transfer" ? r[idx("ke akun")]?.trim() || null : null,
        description: r[idx("deskripsi")]?.trim() || null,
        merchant: r[idx("merchant")]?.trim() || null,
        notes: r[idx("catatan")]?.trim() || null,
      });
    } catch (e) {
      errors.push(`Baris ${i + 1}: ${e instanceof Error ? e.message : "gagal"}`);
    }
  }
  let imported = 0;
  let duplicates = 0;
  if (items.length) {
    const dates = items.map((i) => i.date);
    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    const existing = must<any[]>(await db().from("transactions").select("occurred_at, kind, amount, currency, description").gte("occurred_at", min).lte("occurred_at", max).limit(50000));
    const seen = new Set(existing.map((t) => dupKey({ date: t.occurred_at, kind: t.kind, amount: Number(t.amount), currency: t.currency, description: t.description })));
    for (const it of items) {
      try {
        const key = dupKey({ date: it.date, kind: it.kind, amount: it.amount, currency: it.currency, description: it.description });
        if (seen.has(key)) {
          duplicates++;
          continue;
        }
        seen.add(key);
        await createFromExternal({ kind: it.kind, amount: it.amount, currency: it.currency, category: it.category, account: it.account, to_account: it.to_account, description: it.description, merchant: it.merchant, date: it.date, source: "web", notes: it.notes, raw: null });
        imported++;
      } catch (e) {
        errors.push(`Baris ${it.line}: ${e instanceof Error ? e.message : "gagal"}`);
      }
    }
  }
  const message = `${imported} transaksi berhasil diimpor${duplicates ? `, ${duplicates} duplikat dilewati` : ""}${errors.length ? `, ${errors.length} gagal` : ""}.`;
  if (imported) await logActivity("import", "transactions", { imported, duplicates, failed: errors.length });
  return { imported, duplicates, failed: errors.length, errors: errors.slice(0, 10), message };
}

/* ---------------- Reports ---------------- */
export async function categoryTrend(months: number, endMonth: string) {
  const first = shiftMonth(endMonth, -(months - 1));
  const { start } = monthRange(first);
  const { end } = monthRange(endMonth);
  const rows = must<any[]>(await db().from("transactions").select("amount_idr, occurred_at, category_id, category:categories(id,name,color)").eq("kind", "expense").gte("occurred_at", start).lt("occurred_at", end).limit(50000));
  const list = Array.from({ length: months }, (_, i) => shiftMonth(first, i));
  const cats = new Map<string, { id: string; name: string; color: string | null; total: number }>();
  const series = new Map<string, Record<string, number | string>>(list.map((m) => [m, { month: m }]));
  for (const t of rows) {
    const id = (t.category_id as string) ?? "none";
    const c = cats.get(id) ?? { id, name: t.category?.name ?? "Tanpa kategori", color: t.category?.color ?? null, total: 0 };
    const v = Number(t.amount_idr);
    c.total += v;
    cats.set(id, c);
    const row = series.get(String(t.occurred_at).slice(0, 7));
    if (row) row[id] = Number(row[id] ?? 0) + v;
  }
  return { months: list, categories: [...cats.values()].sort((a, b) => b.total - a.total), series: [...series.values()] };
}

export async function yearlySummary(year: number) {
  const rows = must<any[]>(await db().from("transactions").select("kind, amount_idr, occurred_at").neq("kind", "transfer").gte("occurred_at", `${year}-01-01`).lt("occurred_at", `${year + 1}-01-01`).limit(100000));
  const months = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, "0")}`, income: 0, expense: 0, net: 0 }));
  for (const t of rows) {
    const m = months[Number(String(t.occurred_at).slice(5, 7)) - 1];
    if (!m) continue;
    if (t.kind === "income") m.income += Number(t.amount_idr);
    else m.expense += Number(t.amount_idr);
  }
  for (const m of months) m.net = m.income - m.expense;
  const income = months.reduce((a, m) => a + m.income, 0);
  const expense = months.reduce((a, m) => a + m.expense, 0);
  const t = today();
  const activeMonths = Number(t.slice(0, 4)) === year ? Number(t.slice(5, 7)) : Number(t.slice(0, 4)) > year ? 12 : 0;
  const div = Math.max(1, activeMonths);
  return { year, income, expense, net: income - expense, avgIncome: income / div, avgExpense: expense / div, months };
}

/* ---------------- CSV import ---------------- */
export async function importTransactions(rows: import("./schemas").ImportRowInput[], createMissing: boolean) {
  const cats = must<any[]>(await db().from("categories").select("id, name, kind"));
  const accs = must<any[]>(await db().from("accounts").select("id, name"));
  const catMap = new Map(cats.map((c) => [`${c.kind}:${String(c.name).toLowerCase()}`, c.id as string]));
  const accMap = new Map(accs.map((a) => [String(a.name).toLowerCase(), a.id as string]));
  const rate = await getUsdIdr();
  const out: any[] = [];
  let createdCategories = 0;
  let createdAccounts = 0;
  let duplicates = 0;
  const dates = rows.map((r) => r.date);
  const existing = dates.length
    ? must<any[]>(
        await db()
          .from("transactions")
          .select("occurred_at, kind, amount, currency, description")
          .gte("occurred_at", dates.reduce((a, b) => (a < b ? a : b)))
          .lte("occurred_at", dates.reduce((a, b) => (a > b ? a : b)))
          .limit(50000),
      )
    : [];
  const seen = new Set(existing.map((t) => dupKey({ date: t.occurred_at, kind: t.kind, amount: Number(t.amount), currency: t.currency, description: t.description })));
  for (const r of rows) {
    const key = dupKey({ date: r.date, kind: r.kind, amount: r.amount, currency: r.currency, description: r.notes });
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    let category_id: string | null = null;
    if (r.category) {
      const key2 = `${r.kind}:${r.category.toLowerCase()}`;
      category_id = catMap.get(key2) ?? null;
      if (!category_id && createMissing) {
        category_id = must<any>(await db().from("categories").insert({ name: r.category, kind: r.kind }).select("id").single()).id;
        catMap.set(key2, category_id!);
        createdCategories++;
      }
    }
    let account_id: string | null = null;
    if (r.account) {
      const key2 = r.account.toLowerCase();
      account_id = accMap.get(key2) ?? null;
      if (!account_id && createMissing) {
        account_id = must<any>(await db().from("accounts").insert({ name: r.account, type: "other", currency: r.currency }).select("id").single()).id;
        accMap.set(key2, account_id!);
        createdAccounts++;
      }
    }
    out.push({ kind: r.kind, amount: r.amount, currency: r.currency, amount_idr: await toIdr(r.amount, r.currency, rate), category_id, account_id, description: r.notes, occurred_at: r.date, source: "import" });
  }
  for (let i = 0; i < out.length; i += 500) must(await db().from("transactions").insert(out.slice(i, i + 500)));
  if (out.length) await logActivity("import", "transactions", { imported: out.length, duplicates });
  return { inserted: out.length, duplicates, createdCategories, createdAccounts };
}


/* ---------------- Email ---------------- */
export async function reminderEmail(days: number) {
  const { buildReminderEmail } = await import("./email");
  const list = await computeReminders(days);
  return { count: list.length, reminders: list, ...buildReminderEmail(list) };
}

export async function sendReminderEmail(days: number, to?: string) {
  const key = process.env["RESEND_API_KEY"];
  const from = process.env["EMAIL_FROM"];
  const recipient = to || process.env["EMAIL_TO"];
  if (!key || !from || !recipient) return { sent: false, reason: "Email langsung belum dikonfigurasi (RESEND_API_KEY, EMAIL_FROM, EMAIL_TO)." };
  const mail = await reminderEmail(days);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipient.split(",").map((s) => s.trim()), subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return { sent: false, reason: `Gagal mengirim email (status ${res.status}).`, count: mail.count };
  }
  return { sent: true, count: mail.count, subject: mail.subject };
}

/* ---------------- Reports: net worth ---------------- */
export async function netWorthSeries(months = 12, endMonth: string) {
  const { end } = monthRange(endMonth);
  const assets = await import("./assets.server");
  const [rate, accRes, txRes, goldRows, prices] = await Promise.all([
    getUsdIdr(),
    db().from("accounts").select("initial_balance, currency"),
    db().from("transactions").select("occurred_at, kind, amount_idr").neq("kind", "transfer").lt("occurred_at", end).limit(200000),
    assets.goldGramsByMonth(),
    assets.getGoldPrices().catch(() => ({ world: null, antam: null })),
  ]);
  const accs = must<any[]>(accRes);
  const rows = must<any[]>(txRes);
  const recv = await assets.receivableDeltasByMonth(rate);
  let initial = 0;
  for (const a of accs) initial += Number(a.initial_balance) * (a.currency === "USD" ? rate : 1);
  const first = shiftMonth(endMonth, -(months - 1));
  const monthlyNet = new Map<string, number>();
  const add = (m: string, v: number) => monthlyNet.set(m, (monthlyNet.get(m) ?? 0) + v);
  for (const t of rows) add(String(t.occurred_at).slice(0, 7), t.kind === "income" ? Number(t.amount_idr) : -Number(t.amount_idr));
  for (const r of recv) add(r.month, r.delta);
  const gramsDelta = new Map<string, number>();
  for (const g of goldRows) gramsDelta.set(g.month, (gramsDelta.get(g.month) ?? 0) + g.grams);
  const goldPrice = prices.world?.buyback ?? prices.antam?.buyback ?? 0;
  let cum = initial;
  let grams = 0;
  for (const m of [...new Set([...monthlyNet.keys(), ...gramsDelta.keys()])].sort()) {
    if (m >= first) break;
    cum += monthlyNet.get(m) ?? 0;
    grams += gramsDelta.get(m) ?? 0;
  }
  const out: { month: string; netWorth: number; gold: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = shiftMonth(endMonth, -i);
    cum += monthlyNet.get(m) ?? 0;
    grams += gramsDelta.get(m) ?? 0;
    const gold = r2(Math.max(0, grams) * goldPrice);
    out.push({ month: m, netWorth: r2(cum + gold), gold });
  }
  return out;
}

/* ---------------- Backup ---------------- */
export async function exportBackup() {
  const tables = ["accounts", "categories", "transactions", "debts", "debt_payments", "subscriptions", "budgets", "goals", "fx_rates", "gold_purchases", "gold_prices", "receivables", "receivable_payments"] as const;
  const data: Record<string, any[]> = {};
  const results = await Promise.all(tables.map((t) => db().from(t).select("*").limit(50000)));
  tables.forEach((t, i) => {
    const r = results[i]!;
    if (r.error && !isMissingTable(r.error)) throw new Error(r.error.message);
    data[t] = (r.data ?? []) as any[];
  });
  await logActivity("backup.export", null, { tables: tables.length });
  return { exportedAt: new Date().toISOString(), app: "dompetku", version: 1, data };
}

/* ---------------- Bot command (n8n) ---------------- */
function fmtMoney(n: number, c: string) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: c, maximumFractionDigits: c === "USD" ? 2 : 0 }).format(n);
}

export async function botCommand(text: string): Promise<{ message: string }> {
  const { classifyBotCommand, botHelp, botSearchToken } = await import("./bot");
  const cmd = classifyBotCommand(text);
  let message: string;
  switch (cmd.type) {
    case "balances": {
      const rows = must<any[]>(await db().from("account_balances").select("*").eq("archived", false).order("name"));
      message = rows.length ? `💰 Saldo:\n${rows.map((a) => `• ${a.name}: ${fmtMoney(Number(a.balance), a.currency)}`).join("\n")}` : "Belum ada akun terdaftar.";
      break;
    }
    case "summary":
      message = await summaryText(cmd.month ?? today().slice(0, 7));
      break;
    case "reminders":
      message = remindersText(await computeReminders(14));
      break;
    case "pay":
      message = await botPay(cmd.target, botSearchToken);
      break;
    case "withdraw":
      message = await cashWithdraw(cmd.amount, cmd.from, "telegram");
      break;
    case "help":
      message = botHelp();
      break;
    default:
      message = `🤖 Perintah tidak dikenali: "${text}"\n${botHelp()}`;
  }
  await logActivity("bot.command", null, { text: text.slice(0, 200), type: cmd.type });
  return { message };
}

async function botPay(target: string, clean: (s: string) => string): Promise<string> {
  if (!target) return "Sebutkan namanya juga, mis. 'sudah bayar Netflix' atau 'bayar cicilan KTA'.";
  const token = clean(target);
  const subs = must<any[]>(await db().from("subscriptions").select("id, name").ilike("name", `%${token}%`).limit(5));
  const debts = must<any[]>(await db().from("debts").select("id, name").ilike("name", `%${token}%`).limit(5));
  if (!subs.length && !debts.length) return `❓ Tidak menemukan langganan/cicilan bernama "${target}".`;
  if (subs.length + debts.length > 1) return `❓ Nama "${target}" cocok dengan beberapa item (${[...subs, ...debts].map((x) => x.name).join(", ")}). Sebutkan lebih spesifik.`;
  if (subs[0]) {
    const r = await paySubscription(subs[0]!.id, null, null);
    return `✅ Langganan ${subs[0]!.name} dicatat. Tagihan berikutnya ${r.next_due}.`;
  }
  const d = debts[0]!;
  const { count } = await db().from("debt_payments").select("id", { count: "exact", head: true }).eq("debt_id", d.id);
  await payDebt(d.id, null, null);
  return `✅ Cicilan ${d.name} ke-${(count ?? 0) + 1} dicatat.`;
}


/** ATM cash withdrawal = transfer from a bank/e-wallet account into the first cash account (created if missing). */
export async function cashWithdraw(amount: number, from: string | null, source: "web" | "telegram" = "web"): Promise<string> {
  if (!(amount > 0)) return "Sebutkan nominalnya, mis. 'tarik tunai 500rb'.";
  let cash = await db().from("accounts").select("id, name").eq("type", "cash").eq("archived", false).order("created_at").limit(1).maybeSingle();
  if (!cash.data) cash = await db().from("accounts").insert({ name: "Tunai", type: "cash", currency: "IDR", initial_balance: 0 }).select("id, name").single();
  if (cash.error || !cash.data) throw new Error(cash.error?.message ?? "Akun tunai tidak tersedia");
  let fromId = from ? await findAccount(from) : null;
  if (!fromId) {
    const bank = await db().from("accounts").select("id").eq("type", "bank").eq("archived", false).order("created_at").limit(1).maybeSingle();
    fromId = (bank.data?.id as string) ?? null;
  }
  if (!fromId) return "❓ Tidak ada akun bank untuk ditarik. Sebutkan akunnya, mis. 'tarik tunai 500rb dari BCA'.";
  const fromName = (await db().from("accounts").select("name").eq("id", fromId).single()).data?.name ?? "-";
  await insertTransaction({ kind: "transfer", amount, currency: "IDR", account_id: fromId, to_account_id: cash.data.id, category_id: null, description: "Tarik tunai", merchant: null, occurred_at: today(), source, items: null, notes: null, receipt_path: null });
  return `🏧 Tarik tunai ${fmtMoney(amount, "IDR")} dari ${fromName} ke ${cash.data.name} dicatat.`;
}
