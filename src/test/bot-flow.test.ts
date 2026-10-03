import { beforeEach, describe, expect, it, vi } from "vitest";

/* Minimal in-memory PostgREST-like fake, enough for the bot flow. */
// Loosely typed on purpose: rows are dynamic and accessed with dot notation
// (strict noPropertyAccessFromIndexSignature would reject Record<string, any>).
type Row = any;
const tables: Record<string, Row[]> = {};
function like(v: unknown, pattern: string, ci: boolean) {
  const re = new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", ci ? "i" : "");
  return re.test(String(v ?? ""));
}
function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: any = null;
  let single: "one" | "maybe" | null = null;
  let lim = Infinity;
  const api: any = {
    select: () => api, order: () => api,
    insert: (v: any) => ((op = "insert"), (payload = v), api),
    update: (v: any) => ((op = "update"), (payload = v), api),
    delete: () => ((op = "delete"), api),
    eq: (k: string, v: any) => (filters.push((r) => String(r[k]) === String(v)), api),
    neq: (k: string, v: any) => (filters.push((r) => r[k] !== v), api),
    ilike: (k: string, v: string) => (filters.push((r) => like(r[k], v, true)), api),
    like: (k: string, v: string) => (filters.push((r) => like(r[k], v, false)), api),
    not: (k: string, o: string, v: any) => (filters.push((r) => (o === "is" ? r[k] != null : !like(r[k], v, false))), api),
    in: (k: string, v: any[]) => (filters.push((r) => v.includes(r[k])), api),
    gte: (k: string, v: any) => (filters.push((r) => r[k] >= v), api),
    lt: (k: string, v: any) => (filters.push((r) => r[k] < v), api),
    lte: (k: string, v: any) => (filters.push((r) => r[k] <= v), api),
    limit: (n: number) => ((lim = n), api),
    single: () => ((single = "one"), api),
    maybeSingle: () => ((single = "maybe"), api),
    then: (res: (v: any) => void) => res(run()),
  };
  function run() {
    const t = (tables[table] ??= []);
    if (op === "insert") {
      const rows = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
      for (const r of rows) if (r.external_id && t.some((x) => x.external_id === r.external_id)) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
      t.push(...rows);
      return { data: single ? rows[0] : rows, error: null };
    }
    const hit = t.filter((r) => filters.every((f) => f(r)));
    if (op === "update") hit.forEach((r) => Object.assign(r, payload));
    if (op === "delete") tables[table] = t.filter((r) => !hit.includes(r));
    const rows = hit.slice(0, lim).map((r) => ({ ...r, category: tables["categories"]?.find((c) => c.id === r.category_id) ?? null }));
    if (single) return { data: rows[0] ?? null, error: single === "one" && !rows[0] ? { message: "not found" } : null };
    return { data: rows, error: null };
  }
  return api;
}
vi.mock("../lib/db.server", () => ({ db: () => ({ from: q, storage: { from: () => ({ remove: async () => ({}) }) } }) }));

import { handleBotUpdate } from "../lib/bot.server";

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["categories"] = [
    { id: "c1", name: "Makanan & Minuman", kind: "expense" }, { id: "c2", name: "Transportasi", kind: "expense" },
    { id: "c3", name: "Lainnya", kind: "expense" }, { id: "c4", name: "Gaji", kind: "income" }, { id: "c5", name: "Lainnya", kind: "income" },
  ];
  tables["accounts"] = [{ id: "a1", name: "BCA", archived: false, currency: "IDR", type: "bank" }, { id: "a2", name: "GoPay", archived: false, currency: "IDR", type: "ewallet" }];
  process.env["BOT_DEFAULT_ACCOUNT"] = "BCA";
  process.env["BOT_ALLOWED_CHAT_IDS"] = "111";
  delete process.env["AI_API_KEY"];
});

const cb = (data: string) => handleBotUpdate({ update_id: Math.floor(Math.random() * 1e9), chat_id: "111", callback_data: data });

describe("alur bot end-to-end (tanpa AI)", () => {
  it("chat → pratinjau → ganti kategori → simpan → idempoten → undo", async () => {
    const r1 = await handleBotUpdate({ update_id: 1, chat_id: "111", text: "kopi 25rb pakai gopay" });
    expect(r1.method).toBe("send");
    expect(r1.text).toContain("Rp");
    expect(r1.text).toContain("Makanan & Minuman");
    expect(r1.text).toContain("GoPay");
    const id = tables["bot_drafts"]![0]!.id;

    // retry webhook yang sama → draft tidak dobel
    await handleBotUpdate({ update_id: 1, chat_id: "111", text: "kopi 25rb pakai gopay" });
    expect(tables["bot_drafts"]).toHaveLength(1);

    const menu = await cb(`d:c:${id}`);
    expect(menu.reply_markup!.inline_keyboard.flat().map((b) => b.text)).toContain("Transportasi");
    const changed = await cb(`d:C:${id}:2`); // urutan list: Makanan & Minuman, Transportasi, Lainnya (dari fake)
    expect(changed.method).toBe("edit");

    const saved = await cb(`d:s:${id}`);
    expect(saved.text).toContain("✅ Tercatat");
    expect(saved.toast).toBe("Tersimpan");
    expect(tables["transactions"]).toHaveLength(1);
    expect(tables["transactions"]![0]!.account_id).toBe("a2");
    expect(tables["transactions"]![0]!.external_id).toBe(`draft:${id}`);

    const again = await cb(`d:s:${id}`); // klik ganda
    expect(again.text).toContain("Sudah tersimpan");
    expect(tables["transactions"]).toHaveLength(1);

    const txId = tables["transactions"]![0]!.id;
    const undo = await cb(`u:${txId}`);
    expect(undo.text).toContain("Dihapus");
    expect(tables["transactions"]).toHaveLength(0);
    expect(tables["bot_drafts"]![0]!.status).toBe("undone");
  });

  it("akun default dipakai saat tidak disebut; batal tidak menyimpan", async () => {
    const r = await handleBotUpdate({ update_id: 2, chat_id: "111", text: "gaji 8jt" });
    expect(r.text).toContain("BCA (default)");
    expect(r.text).toContain("Gaji");
    const id = tables["bot_drafts"]![0]!.id;
    const x = await cb(`d:x:${id}`);
    expect(x.text).toContain("Dibatalkan");
    expect(tables["transactions"] ?? []).toHaveLength(0);
  });

  it("chat asing diabaikan, perintah tidak memakai AI", async () => {
    expect((await handleBotUpdate({ update_id: 3, chat_id: "999", text: "kopi 25rb" })).method).toBe("none");
    const help = await handleBotUpdate({ update_id: 4, chat_id: "111", text: "/help" });
    expect(help.text).toContain("/paylater");
  });

  it("pesan ambigu tanpa AI key memberi error ramah (bukan crash diam)", async () => {
    await expect(handleBotUpdate({ update_id: 5, chat_id: "111", text: "kemarin patungan sama andi" })).rejects.toThrow(/AI_API_KEY/);
  });
});
