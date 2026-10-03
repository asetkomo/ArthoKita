import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import { CRUD_TABLES, DELETABLE_TABLES, importRowSchema, tableSchemas, transactionSchema } from "./schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
const month = z.string().regex(/^\d{4}-\d{2}$/);
const optUuid = z.string().uuid().nullable().optional();
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();

export const listRows = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ table: z.enum(CRUD_TABLES) }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const byName = data.table === "categories" || data.table === "accounts";
    const res = await db().from(data.table).select("*").order(byName ? "name" : "created_at", { ascending: true });
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as any[];
  });

export const saveRow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ table: z.enum(CRUD_TABLES), id: z.string().uuid().nullable().optional(), values: z.unknown() }).parse(d))
  .handler(async ({ data }) => {
    const values = tableSchemas[data.table].parse(data.values);
    const { db } = await import("./db.server");
    const q = data.id ? db().from(data.table).update(values).eq("id", data.id) : db().from(data.table).insert(values);
    const res = await q.select().single();
    if (res.error) throw new Error(res.error.message);
    const { logActivity } = await import("./finance.server");
    await logActivity(`${data.table}.${data.id ? "update" : "create"}`, data.table, { name: (values as any).name ?? null });
    return res.data as any;
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ table: z.enum(DELETABLE_TABLES), id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    if (data.table === "debt_payments") {
      const { deleteDebtPayment, logActivity } = await import("./finance.server");
      await deleteDebtPayment(data.id);
      await logActivity("debt_payment.delete", "debt_payments", { id: data.id });
      return { ok: true };
    }
    const { db } = await import("./db.server");
    if (data.table === "transactions") {
      const old = await db().from("transactions").select("receipt_path").eq("id", data.id).maybeSingle();
      const { removeReceipt } = await import("./receipt.server");
      await removeReceipt((old.data as any)?.receipt_path);
    }
    const res = await db().from(data.table).delete().eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    const { logActivity } = await import("./finance.server");
    await logActivity(`${data.table}.delete`, data.table, { id: data.id });
    return { ok: true };
  });


export const saveTransaction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().nullable().optional(), values: transactionSchema }).parse(d))
  .handler(async ({ data }) => {
    const { insertTransaction, updateTransaction } = await import("./finance.server");
    return (data.id ? await updateTransaction(data.id, data.values) : await insertTransaction(data.values)) as any;
  });

const txFilterSchema = z.object({ month: month.optional(), kind: z.enum(["income", "expense", "transfer"]).optional(), search: z.string().max(100).optional(), category_id: z.string().uuid().optional(), account_id: z.string().uuid().optional() });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => txFilterSchema.extend({ offset: z.number().int().min(0).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { listTransactions } = await import("./finance.server");
    return (await listTransactions(data)) as any[];
  });

export const getTxCount = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => txFilterSchema.parse(d))
  .handler(async ({ data }) => {
    const { countTransactions } = await import("./finance.server");
    return countTransactions(data);
  });


export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ month }).parse(d))
  .handler(async ({ data }) => {
    const { computeDashboard } = await import("./finance.server");
    return (await computeDashboard(data.month)) as any;
  });

export const getReminders = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365) }).parse(d))
  .handler(async ({ data }) => {
    const { computeReminders } = await import("./finance.server");
    return computeReminders(data.days);
  });

export const getDebts = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { computeDebts } = await import("./finance.server");
    return (await computeDebts()) as any[];
  });

export const getBudgets = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ month }).parse(d))
  .handler(async ({ data }) => {
    const { computeBudgets } = await import("./finance.server");
    return computeBudgets(data.month);
  });

export const getBalances = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { db } = await import("./db.server");
    const res = await db().from("account_balances").select("*").order("name");
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []) as any[];
  });

export const getFxRate = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { getUsdIdr } = await import("./finance.server");
    return { usdIdr: await getUsdIdr() };
  });

export const payDebt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ debt_id: z.string().uuid(), account_id: optUuid, date: optDate }).parse(d))
  .handler(async ({ data }) => {
    const { payDebt } = await import("./finance.server");
    return payDebt(data.debt_id, data.account_id ?? null, data.date ?? null);
  });

export const paySubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), account_id: optUuid, date: optDate }).parse(d))
  .handler(async ({ data }) => {
    const { paySubscription } = await import("./finance.server");
    return paySubscription(data.id, data.account_id ?? null, data.date ?? null);
  });

export const addGoalFunds = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), amount: z.number().finite() }).parse(d))
  .handler(async ({ data }) => {
    const { db } = await import("./db.server");
    const g = await db().from("goals").select("saved_amount").eq("id", data.id).single();
    if (g.error) throw new Error(g.error.message);
    const saved = Math.max(0, Number(g.data.saved_amount) + data.amount);
    const res = await db().from("goals").update({ saved_amount: saved }).eq("id", data.id);
    if (res.error) throw new Error(res.error.message);
    return { ok: true, saved };
  });

export const exportTransactionsCsv = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ month: month.optional() }).parse(d))
  .handler(async ({ data }) => {
    const { exportCsv } = await import("./finance.server");
    return { csv: await exportCsv(data.month) };
  });

export const scanReceipt = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { parseReceipt } = await import("./ocr.server");
    const { categoryNames } = await import("./finance.server");
    return parseReceipt(data.image, await categoryNames());
  });

export const getYearly = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ year: z.string().regex(/^\d{4}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { computeYearly } = await import("./finance.server");
    return (await computeYearly(data.year)) as any;
  });

export const importTransactionsCsv = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ csv: z.string().min(1).max(5_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { importCsv } = await import("./finance.server");
    return importCsv(data.csv);
  });

export const uploadReceiptImage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { uploadReceipt } = await import("./receipt.server");
    return uploadReceipt(data.image);
  });

export const getReceiptUrl = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { receiptUrl } = await import("./receipt.server");
    return { url: await receiptUrl(data.path) };
  });

export const getCategoryTrend = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ months: z.number().int().min(3).max(24), end: month }).parse(d))
  .handler(async ({ data }) => {
    const { categoryTrend } = await import("./finance.server");
    return categoryTrend(data.months, data.end);
  });

export const getYearlySummary = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int().min(2000).max(2100) }).parse(d))
  .handler(async ({ data }) => {
    const { yearlySummary } = await import("./finance.server");
    return yearlySummary(data.year);
  });

export const importCsvTransactions = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(importRowSchema).min(1).max(5000), createMissing: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { importTransactions } = await import("./finance.server");
    return importTransactions(data.rows, data.createMissing);
  });

export const getNetWorth = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ months: z.number().int().min(3).max(36), end: month }).parse(d))
  .handler(async ({ data }) => {
    const { netWorthSeries } = await import("./finance.server");
    return netWorthSeries(data.months, data.end);
  });

export const exportBackupJson = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { exportBackup } = await import("./finance.server");
    return exportBackup();
  });

export const getActivity = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(100).default(30) }).parse(d))
  .handler(async ({ data }) => {
    const { listActivity } = await import("./finance.server");
    return listActivity(data.limit ?? 30);
  });

