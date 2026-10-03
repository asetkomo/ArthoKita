import { z } from "zod";

export const CURRENCIES = ["IDR", "USD"] as const;
export const CRUD_TABLES = ["accounts", "categories", "debts", "subscriptions", "budgets", "goals", "gold_purchases"] as const;
export type CrudTable = (typeof CRUD_TABLES)[number];
export const DELETABLE_TABLES = [...CRUD_TABLES, "transactions", "debt_payments"] as const;

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const optId = z.preprocess(emptyToNull, z.string().uuid().nullable());
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");
const optDate = z.preprocess(emptyToNull, dateStr.nullable());
const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
const money = z.coerce.number().finite().positive("Jumlah harus lebih dari 0");

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["bank", "ewallet", "cash", "credit_card", "investment", "other"]),
  currency: z.enum(CURRENCIES),
  initial_balance: z.coerce.number().finite().default(0),
  color: optText(20),
  archived: z.boolean().default(false),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(["income", "expense"]),
  color: optText(20),
});

export const itemSchema = z.object({
  name: z.string().max(200),
  qty: z.coerce.number().nullable().optional(),
  price: z.coerce.number().nullable().optional(),
});

export const transactionSchema = z.object({
  kind: z.enum(["income", "expense", "transfer"]),
  amount: money,
  currency: z.enum(CURRENCIES).default("IDR"),
  account_id: optId,
  to_account_id: optId,
  category_id: optId,
  description: optText(500),
  merchant: optText(200),
  occurred_at: dateStr,
  source: z.enum(["web", "telegram", "whatsapp", "ocr", "n8n", "import"]).default("web"),
  items: z.array(itemSchema).max(200).nullable().default(null),
  notes: optText(1000),
  receipt_path: optText(500),
});
export type TransactionInput = z.output<typeof transactionSchema>;

export const debtSchema = z.object({
  name: z.string().trim().min(1).max(100),
  provider: optText(100),
  kind: z.enum(["paylater", "loan", "credit_card", "personal", "other"]),
  currency: z.enum(CURRENCIES),
  total_amount: money,
  installment_amount: money,
  total_installments: z.coerce.number().int().min(1).max(600),
  start_date: dateStr,
  due_day: z.coerce.number().int().min(1).max(31),
  interest_rate: z.preprocess(emptyToNull, z.coerce.number().min(0).max(1000).nullable()),
  account_id: optId,
  notes: optText(1000),
  status: z.enum(["active", "paid_off"]).default("active"),
});

export const subscriptionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  amount: money,
  currency: z.enum(CURRENCIES),
  cycle: z.enum(["monthly", "yearly"]),
  next_due: dateStr,
  account_id: optId,
  category_id: optId,
  active: z.boolean().default(true),
  notes: optText(1000),
});

export const budgetSchema = z.object({
  category_id: z.string().uuid("Pilih kategori"),
  amount: money,
  alert_percent: z.coerce.number().int().min(1).max(100).default(80),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1).max(100),
  target_amount: money,
  saved_amount: z.coerce.number().min(0).default(0),
  deadline: optDate,
  color: optText(20),
});

export const goldSchema = z.object({
  kind: z.enum(["buy", "sell"]).default("buy"),
  occurred_at: dateStr,
  grams: z.coerce.number().finite().positive("Gram harus lebih dari 0").max(100000),
  price_per_gram: money,
  total: z.preprocess(emptyToNull, z.coerce.number().finite().positive().nullable()),
  place: optText(100),
  notes: optText(1000),
}).transform((v) => ({ ...v, total: v.total ?? Math.round(v.grams * v.price_per_gram) }));

export const receivableSchema = z.object({
  name: z.string().trim().min(1).max(100),
  borrower: optText(100),
  amount: money,
  currency: z.enum(CURRENCIES).default("IDR"),
  lent_at: dateStr,
  due_date: optDate,
  account_id: optId,
  notes: optText(1000),
});
export type ReceivableInput = z.output<typeof receivableSchema>;

export const tableSchemas: Record<CrudTable, z.ZodTypeAny> = {
  accounts: accountSchema,
  categories: categorySchema,
  debts: debtSchema,
  subscriptions: subscriptionSchema,
  budgets: budgetSchema,
  goals: goalSchema,
  gold_purchases: goldSchema,
};

/** Payload from n8n / bots. Category & account are matched by name. */
export const externalTxSchema = z.object({
  kind: z.enum(["income", "expense", "transfer"]).default("expense"),
  amount: z.coerce.number().positive(),
  currency: z.enum(CURRENCIES).default("IDR"),
  category: z.string().max(60).nullable().optional(),
  account: z.string().max(80).nullable().optional(),
  to_account: z.string().max(80).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  merchant: z.string().max(200).nullable().optional(),
  date: dateStr.nullable().optional(),
  source: z.enum(["web", "telegram", "whatsapp", "ocr", "n8n"]).default("n8n"),
  items: z.array(itemSchema).max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  raw: z.unknown().optional(),
});
export type ExternalTx = z.output<typeof externalTxSchema>;

export const draftSchema = z.object({
  kind: z.enum(["income", "expense"]).catch("expense"),
  amount: z.coerce.number().catch(0),
  currency: z.enum(CURRENCIES).catch("IDR"),
  merchant: z.string().nullable().catch(null),
  date: z.string().nullable().catch(null),
  category: z.string().nullable().catch(null),
  description: z.string().nullable().catch(null),
  items: z.array(itemSchema).catch([]),
});
export type Draft = z.output<typeof draftSchema>;

// Row types used in the UI
export type Account = z.output<typeof accountSchema> & { id: string; created_at: string };
export type Category = z.output<typeof categorySchema> & { id: string };
export type Debt = z.output<typeof debtSchema> & { id: string };
export type Subscription = z.output<typeof subscriptionSchema> & { id: string };
export type Budget = z.output<typeof budgetSchema> & { id: string };
export type GoldRow = z.output<typeof goldSchema> & { id: string };
export type Goal = z.output<typeof goalSchema> & { id: string };

export const importRowSchema = z.object({
  date: dateStr,
  kind: z.enum(["income", "expense"]),
  amount: z.number().finite().positive(),
  currency: z.enum(CURRENCIES),
  category: z.string().trim().max(60).nullable(),
  account: z.string().trim().max(80).nullable(),
  notes: z.string().max(1000).nullable(),
});
export type ImportRowInput = z.output<typeof importRowSchema>;
