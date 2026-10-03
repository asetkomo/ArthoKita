import { db } from "./db.server";
import { getUsdIdr, insertTransaction, ensureCategory, isMissingTable, logActivity, today } from "./finance.server";
import { goldHoldings, receivableStatus, TROY_OUNCE_GRAMS, type GoldPrice } from "./assets";
import type { ReceivableInput } from "./schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
const ANTAM_PREMIUM = 1.12; // fallback estimate when no Antam price is reachable
const ANTAM_BUYBACK_RATIO = 0.9;

async function fetchText(url: string, ms = 6000): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { "user-agent": "Mozilla/5.0 Dompetku" } });
    return res.ok ? await res.text() : null;
  } catch (e) {
    console.error("fetch failed", url, e);
    return null;
  }
}

/** World XAU spot (USD/oz) converted to IDR per gram. */
async function fetchWorld(): Promise<{ buy: number; buyback: number } | null> {
  const txt = await fetchText("https://api.gold-api.com/price/XAU");
  const usdOz = Number(txt ? (JSON.parse(txt) as any)?.price : NaN);
  if (!(usdOz > 0)) return null;
  const perGram = Math.round((usdOz * (await getUsdIdr())) / TROY_OUNCE_GRAMS);
  return { buy: perGram, buyback: perGram };
}

const rupiah = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** Antam 1 gram price from public pages. Returns null when parsing fails. */
async function fetchAntam(): Promise<{ buy: number; buyback: number } | null> {
  const html = await fetchText("https://www.logammulia.com/id/harga-emas-hari-ini");
  let buy = 0;
  let buyback = 0;
  if (html) {
    const m = html.match(/>\s*1\s*gr\s*<\/td>\s*<td[^>]*>\s*([\d.,]+)/i);
    if (m) buy = rupiah(m[1]!);
  }
  const bb = await fetchText("https://www.logammulia.com/id/sell/gold");
  if (bb) {
    const m = bb.match(/Harga\s*Buyback[^R]*Rp\s*([\d.,]+)/i);
    if (m) buyback = rupiah(m[1]!);
  }
  const ok = (n: number) => n > 300_000 && n < 20_000_000;
  if (!ok(buy) && !ok(buyback)) return null;
  return { buy: ok(buy) ? buy : Math.round(buyback / ANTAM_BUYBACK_RATIO), buyback: ok(buyback) ? buyback : Math.round(buy * ANTAM_BUYBACK_RATIO) };
}

async function cached(source: "world" | "antam"): Promise<{ row: any | null; ready: boolean }> {
  const res = await db().from("gold_prices").select("price_date, source, buy, buyback, estimated").eq("source", source).order("price_date", { ascending: false }).limit(1).maybeSingle();
  if (res.error) return { row: null, ready: !isMissingTable(res.error) };
  return { row: res.data, ready: true };
}

const toPrice = (r: any, source: "world" | "antam"): GoldPrice => ({ source, date: String(r.price_date), buy: Number(r.buy), buyback: Number(r.buyback), estimated: !!r.estimated });

/** Both reference prices, cached once per day in gold_prices; safe fallbacks when sources fail. */
export async function getGoldPrices(): Promise<{ world: GoldPrice | null; antam: GoldPrice | null }> {
  const d = today();
  const [w, a] = await Promise.all([cached("world"), cached("antam")]);
  let world = w.row && String(w.row.price_date) === d ? toPrice(w.row, "world") : null;
  let antam = a.row && String(a.row.price_date) === d && !a.row.estimated ? toPrice(a.row, "antam") : null;
  const [fw, fa] = await Promise.all([world ? null : fetchWorld(), antam ? null : fetchAntam()]);
  if (!world) {
    if (fw) {
      world = { source: "world", date: d, ...fw, estimated: false };
      if (w.ready) await db().from("gold_prices").upsert({ price_date: d, source: "world", buy: fw.buy, buyback: fw.buyback, estimated: false });
    } else if (w.row) world = toPrice(w.row, "world");
  }
  if (!antam) {
    if (fa) {
      antam = { source: "antam", date: d, ...fa, estimated: false };
      if (a.ready) await db().from("gold_prices").upsert({ price_date: d, source: "antam", buy: fa.buy, buyback: fa.buyback, estimated: false });
    } else if (a.row) antam = toPrice(a.row, "antam");
    else if (world) antam = { source: "antam", date: d, buy: Math.round(world.buy * ANTAM_PREMIUM), buyback: Math.round(world.buy * ANTAM_PREMIUM * ANTAM_BUYBACK_RATIO), estimated: true };
  }
  return { world, antam };
}

export async function goldSummary() {
  const res = await db().from("gold_purchases").select("id, kind, occurred_at, grams, price_per_gram, total, place, notes").order("occurred_at", { ascending: false });
  if (res.error) {
    if (isMissingTable(res.error)) return { ready: false as const };
    throw new Error(res.error.message);
  }
  const rows = (res.data ?? []).map((r: any) => ({ ...r, grams: Number(r.grams), price_per_gram: Number(r.price_per_gram), total: Number(r.total) }));
  const prices = await getGoldPrices();
  return { ready: true as const, rows, holdings: goldHoldings(rows), prices };
}

/** Grams held at end of each month key (YYYY-MM) — used by net worth. */
export async function goldGramsByMonth(): Promise<{ month: string; grams: number }[]> {
  const res = await db().from("gold_purchases").select("kind, occurred_at, grams");
  if (res.error) return [];
  return (res.data ?? []).map((r: any) => ({ month: String(r.occurred_at).slice(0, 7), grams: (r.kind === "sell" ? -1 : 1) * Number(r.grams) }));
}

/* ---------------- Receivables ---------------- */
export async function listReceivables() {
  const [r, p] = await Promise.all([
    db().from("receivables").select("*").order("lent_at", { ascending: false }),
    db().from("receivable_payments").select("id, receivable_id, amount, paid_at, account_id").order("paid_at"),
  ]);
  if (r.error || p.error) {
    if (isMissingTable(r.error) || isMissingTable(p.error)) return { ready: false as const };
    throw new Error((r.error ?? p.error)!.message);
  }
  const items = (r.data ?? []).map((x: any) => {
    const payments = (p.data ?? []).filter((y: any) => y.receivable_id === x.id).map((y: any) => ({ ...y, amount: Number(y.amount) }));
    return { ...x, amount: Number(x.amount), payments, ...receivableStatus(Number(x.amount), payments) };
  });
  return { ready: true as const, items };
}

export async function saveReceivable(id: string | null, v: ReceivableInput) {
  if (id) {
    const res = await db().from("receivables").update(v).eq("id", id).select().single();
    if (res.error) throw new Error(res.error.message);
    await logActivity("receivables.update", "receivables", { name: v.name, amount: v.amount, currency: v.currency });
    return res.data;
  }
  let transaction_id: string | null = null;
  if (v.account_id) {
    const cat = await ensureCategory("Piutang", "expense");
    const tx = await insertTransaction({ kind: "expense", amount: v.amount, currency: v.currency, account_id: v.account_id, to_account_id: null, category_id: cat, description: `Pinjaman ke ${v.borrower ?? v.name}`, merchant: null, occurred_at: v.lent_at, source: "web", items: null, notes: v.notes, receipt_path: null });
    transaction_id = tx.id;
  }
  const res = await db().from("receivables").insert({ ...v, transaction_id }).select().single();
  if (res.error) throw new Error(res.error.message);
  await logActivity("receivables.create", "receivables", { name: v.name, amount: v.amount, currency: v.currency });
  return res.data;
}

export async function payReceivable(id: string, amount: number, accountId: string | null, date: string | null) {
  const r = await db().from("receivables").select("*").eq("id", id).single();
  if (r.error) throw new Error(r.error.message);
  const rec: any = r.data;
  const paidAt = date ?? today();
  const acc = accountId ?? rec.account_id ?? null;
  let transaction_id: string | null = null;
  if (acc) {
    const cat = await ensureCategory("Piutang", "income");
    const tx = await insertTransaction({ kind: "income", amount, currency: rec.currency, account_id: acc, to_account_id: null, category_id: cat, description: `Pembayaran piutang ${rec.borrower ?? rec.name}`, merchant: null, occurred_at: paidAt, source: "web", items: null, notes: null, receipt_path: null });
    transaction_id = tx.id;
  }
  const ins = await db().from("receivable_payments").insert({ receivable_id: id, amount, paid_at: paidAt, account_id: acc, transaction_id });
  if (ins.error) throw new Error(ins.error.message);
  const pays = await db().from("receivable_payments").select("amount").eq("receivable_id", id);
  const paid = (pays.data ?? []).reduce((a: number, x: any) => a + Number(x.amount), 0);
  if (paid >= Number(rec.amount)) await db().from("receivables").update({ status: "paid" }).eq("id", id);
  await logActivity("receivable.pay", "receivables", { name: rec.name, amount, currency: rec.currency });
  return { ok: true };
}

export async function setReceivableStatus(id: string, status: "active" | "paid") {
  const res = await db().from("receivables").update({ status }).eq("id", id).select("name, amount, currency").single();
  if (res.error) throw new Error(res.error.message);
  await logActivity(status === "paid" ? "receivable.settle" : "receivable.reopen", "receivables", res.data);
  return { ok: true };
}

export async function deleteReceivablePayment(id: string) {
  const p = await db().from("receivable_payments").select("*").eq("id", id).single();
  if (p.error) throw new Error(p.error.message);
  const row: any = p.data;
  await db().from("receivable_payments").delete().eq("id", id);
  if (row.transaction_id) await db().from("transactions").delete().eq("id", row.transaction_id);
  await db().from("receivables").update({ status: "active" }).eq("id", row.receivable_id);
  await logActivity("receivable_payment.delete", "receivables", { amount: Number(row.amount) });
}

export async function deleteReceivable(id: string) {
  const r = await db().from("receivables").select("name, amount, currency, transaction_id").eq("id", id).single();
  const pays = await db().from("receivable_payments").select("transaction_id").eq("receivable_id", id);
  const txIds = [(r.data as any)?.transaction_id, ...((pays.data ?? []) as any[]).map((x) => x.transaction_id)].filter(Boolean);
  const del = await db().from("receivables").delete().eq("id", id);
  if (del.error) throw new Error(del.error.message);
  if (txIds.length) await db().from("transactions").delete().in("id", txIds);
  await logActivity("receivables.delete", "receivables", { name: (r.data as any)?.name ?? null, amount: (r.data as any)?.amount ?? null });
}

/** Outstanding receivable principal (IDR) per lent month, minus repayments per month. */
export async function receivableDeltasByMonth(rate: number): Promise<{ month: string; delta: number }[]> {
  const [r, p] = await Promise.all([db().from("receivables").select("id, amount, currency, lent_at, account_id"), db().from("receivable_payments").select("receivable_id, amount, paid_at")]);
  if (r.error || p.error) return [];
  const cur = new Map((r.data ?? []).map((x: any) => [x.id, x]));
  const out: { month: string; delta: number }[] = [];
  // Only linked loans left the account balance; unlinked ones never entered net worth.
  for (const x of r.data ?? []) if ((x as any).account_id) out.push({ month: String((x as any).lent_at).slice(0, 7), delta: Number((x as any).amount) * ((x as any).currency === "USD" ? rate : 1) });
  for (const y of p.data ?? []) {
    const rec: any = cur.get((y as any).receivable_id);
    if (rec?.account_id) out.push({ month: String((y as any).paid_at).slice(0, 7), delta: -Number((y as any).amount) * (rec.currency === "USD" ? rate : 1) });
  }
  return out;
}
