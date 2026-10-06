import { describe, expect, it } from "vitest";
import {
  classifyBotCommand,
  guessCategory,
  matchCategory,
  parseCallback,
  pickerKeyboard,
  previewKeyboard,
  previewText,
  previousRange,
  quickParse,
  resolvePeriod,
} from "../lib/bot";

const EXP = [
  "Belanja",
  "Biaya Admin",
  "Cicilan & Hutang",
  "Hiburan",
  "Kesehatan",
  "Langganan",
  "Lainnya",
  "Makanan & Minuman",
  "Pendidikan",
  "Tagihan & Utilitas",
  "Transportasi",
];
const INC = ["Bonus", "Freelance", "Gaji", "Lainnya"];
const ACC = ["BCA", "GoPay", "Mandiri", "Tunai"];
const T = "2026-10-03"; // Sabtu

describe("perintah slash", () => {
  it("mengenali laporan & daftar", () => {
    expect(classifyBotCommand("/hariini")).toEqual({ type: "report", period: "today" });
    expect(classifyBotCommand("/minggu@ArhokitaBot")).toEqual({ type: "report", period: "week" });
    expect(classifyBotCommand("/bulan 2026-05")).toEqual({ type: "report", period: "2026-05" });
    expect(classifyBotCommand("/pengeluaran minggu")).toEqual({
      type: "list",
      kind: "expense",
      period: "minggu",
    });
    expect(classifyBotCommand("/pemasukan")).toEqual({
      type: "list",
      kind: "income",
      period: "month",
    });
    expect(classifyBotCommand("/tagihan 30")).toEqual({ type: "reminders", days: 30 });
    expect(classifyBotCommand("/paylater")).toEqual({ type: "debts" });
    expect(classifyBotCommand("/langganan")).toEqual({ type: "subscriptions" });
    expect(classifyBotCommand("/bayar Netflix")).toEqual({ type: "pay", target: "netflix" });
    expect(classifyBotCommand("/tarik 500rb dari bca")).toEqual({
      type: "withdraw",
      amount: 500000,
      from: "bca",
    });
    expect(classifyBotCommand("/xyz")).toEqual({ type: "unknown" });
  });
  it("teks transaksi biasa tidak dianggap perintah", () => {
    expect(classifyBotCommand("bayar listrik 300rb").type).toBe("unknown");
    expect(classifyBotCommand("kopi 25rb").type).toBe("unknown");
    expect(classifyBotCommand("saldo").type).toBe("balances");
    expect(classifyBotCommand("sudah bayar netflix")).toEqual({ type: "pay", target: "netflix" });
  });
});

describe("periode", () => {
  it("minggu dimulai Senin", () => {
    expect(resolvePeriod("minggu", T)).toMatchObject({ start: "2026-09-28", end: "2026-10-04" });
    expect(resolvePeriod("minggulalu", T)).toMatchObject({
      start: "2026-09-21",
      end: "2026-09-28",
    });
    expect(resolvePeriod("kemarin", T)).toMatchObject({ start: "2026-10-02", end: "2026-10-03" });
    expect(resolvePeriod("bulanlalu", T)).toMatchObject({ start: "2026-09-01", end: "2026-10-01" });
    expect(resolvePeriod("2026-02", T)).toMatchObject({ start: "2026-02-01", end: "2026-03-01" });
    expect(resolvePeriod("besok", T)).toBeNull();
  });
  it("periode pembanding", () => {
    expect(previousRange({ start: "2026-10-01", end: "2026-11-01" })).toEqual({
      start: "2026-09-01",
      end: "2026-10-01",
    });
    expect(previousRange({ start: "2026-09-28", end: "2026-10-04" })).toEqual({
      start: "2026-09-22",
      end: "2026-09-28",
    });
  });
});

describe("kategori", () => {
  it("tidak pernah menghasilkan akhiran (expense)", () => {
    expect(matchCategory("Makanan & Minuman (expense)", EXP)).toBe("Makanan & Minuman");
    expect(matchCategory("makanan", EXP)).toBe("Makanan & Minuman");
    expect(matchCategory("Transport", EXP)).toBe("Transportasi");
    expect(matchCategory("Crypto", EXP)).toBeNull();
  });
  it("tebakan kata kunci tanpa AI", () => {
    expect(guessCategory("kopi kenangan", EXP)).toBe("Makanan & Minuman");
    expect(guessCategory("grabfood ayam", EXP)).toBe("Makanan & Minuman");
    expect(guessCategory("grab ke kantor", EXP)).toBe("Transportasi");
    expect(guessCategory("token listrik", EXP)).toBe("Tagihan & Utilitas");
    expect(guessCategory("gaji oktober", INC)).toBe("Gaji");
    expect(guessCategory("hadiah ulang tahun", EXP)).toBeNull();
  });
});

describe("quickParse (0 token)", () => {
  it("mengurai pola umum", () => {
    expect(quickParse("kopi 25rb", T, ACC)).toEqual({
      kind: "expense",
      amount: 25000,
      currency: "IDR",
      description: "Kopi",
      date: T,
      account: null,
    });
    expect(quickParse("makan siang 45.000 pakai gopay", T, ACC)).toMatchObject({
      amount: 45000,
      description: "Makan siang",
      account: "GoPay",
    });
    expect(quickParse("gaji masuk 8jt ke BCA", T, ACC)).toMatchObject({
      kind: "income",
      amount: 8000000,
      account: "BCA",
    });
    expect(quickParse("netflix $15.99", T, ACC)).toMatchObject({
      amount: 15.99,
      currency: "USD",
      description: "Netflix",
    });
    expect(quickParse("bensin 1,5jt kemarin", T, ACC)).toMatchObject({
      amount: 1500000,
      date: "2026-10-02",
      description: "Bensin",
    });
    expect(quickParse("Rp 120.500 indomaret mandiri", T, ACC)).toMatchObject({
      amount: 120500,
      account: "Mandiri",
      description: "Indomaret",
    });
  });
  it("menyerah (→ AI) bila ambigu", () => {
    expect(quickParse("beli 2 kopi", T, ACC)).toBeNull();
    expect(quickParse("tgl 5 bayar kos 1jt", T, ACC)).toBeNull();
    expect(quickParse("pinjam ke andi 200rb", T, ACC)).toBeNull();
    expect(quickParse("halo", T, ACC)).toBeNull();
  });
});

describe("UI Telegram", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  it("callback_data ≤ 64 byte & bisa diurai balik", () => {
    const all = [
      ...previewKeyboard(id).inline_keyboard.flat(),
      ...pickerKeyboard(id, "A", ACC, { text: "x", idx: 999 }).inline_keyboard.flat(),
    ];
    for (const b of all)
      expect(new TextEncoder().encode(b.callback_data).length).toBeLessThanOrEqual(64);
    expect(parseCallback(`d:s:${id}`)).toEqual({ kind: "draft", op: "s", id, idx: null });
    expect(parseCallback(`d:A:${id}:999`)).toEqual({ kind: "draft", op: "A", id, idx: 999 });
    expect(parseCallback(`u:${id}`)).toEqual({ kind: "undo", id });
    expect(parseCallback("d:s:not-a-uuid")).toBeNull();
  });
  it("pratinjau menampilkan akun default", () => {
    const t = previewText(
      {
        kind: "expense",
        amount: 25000,
        currency: "IDR",
        category: "Makanan & Minuman",
        account: null,
        description: "Kopi",
        merchant: null,
        date: T,
        items: [],
        via: "quick",
      },
      "BCA",
    );
    expect(t).toContain("BCA (default)");
    expect(t).toContain("⚡");
  });
});
