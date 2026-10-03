import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CURRENCY_OPTIONS, EntityDialog, type FieldDef } from "./entity-dialog";
import { rowsQuery } from "@/lib/queries";
import { saveTransaction } from "@/lib/finance.functions";
import { todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import type { Account, Category } from "@/lib/schemas";

export type TxDraft = Record<string, unknown>;

export function newTxDraft(kind: "income" | "expense" | "transfer" = "expense"): TxDraft {
  return { kind, currency: "IDR", occurred_at: todayStr(), source: "web", items: null };
}

export function TransactionDialog({ open, onOpenChange, initial, id }: { open: boolean; onOpenChange: (o: boolean) => void; initial: TxDraft; id?: string | null }) {
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const categories = (useQuery(rowsQuery("categories")).data ?? []) as Category[];
  const save = useServerFn(saveTransaction);
  const qc = useQueryClient();
  const accOpts = [{ value: "", label: "— Tanpa akun —" }, ...accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))];

  const fields = (v: Record<string, unknown>): FieldDef[] => [
    { name: "kind", label: "Jenis", type: "select", half: true, options: [ { value: "expense", label: "Pengeluaran" }, { value: "income", label: "Pemasukan" }, { value: "transfer", label: "Transfer antar akun" } ] },
    { name: "occurred_at", label: "Tanggal", type: "date", half: true },
    { name: "amount", label: "Jumlah", type: "number", half: true, placeholder: "50000" },
    { name: "currency", label: "Mata uang", type: "select", half: true, options: CURRENCY_OPTIONS },
    { name: "account_id", label: v["kind"] === "transfer" ? "Dari akun" : "Akun / dompet", type: "select", half: true, options: accOpts },
    v["kind"] === "transfer"
      ? { name: "to_account_id", label: "Ke akun", type: "select", half: true, options: accOpts }
      : { name: "category_id", label: "Kategori", type: "select", half: true, options: [{ value: "", label: "— Tanpa kategori —" }, ...categories.filter((c) => c.kind === v["kind"]).map((c) => ({ value: c.id, label: c.name }))] },
    { name: "description", label: "Deskripsi", type: "text", placeholder: "Makan siang, gaji Oktober…" },
    { name: "merchant", label: "Merchant / sumber", type: "text", half: true },
    { name: "notes", label: "Catatan", type: "text", half: true },
  ];

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={id ? "Ubah transaksi" : "Catat transaksi"}
      fields={fields}
      initial={initial}
      onSubmit={async (v) => {
        await save({ data: { id: id ?? null, values: v as never } });
        await qc.invalidateQueries();
      }}
      extra={(v) => {
        const items = v["items"] as { name: string; qty?: number | null; price?: number | null }[] | null;
        if (!items?.length) return null;
        return (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            <p className="mb-2 font-medium">Rincian item dari nota</p>
            <ul className="space-y-1">
              {items.map((it, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{it.qty ? `${it.qty}× ` : ""}{it.name}</span>
                  <span className="num text-muted-foreground">{it.price != null ? money(it.price, String(v["currency"] ?? "IDR")) : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      }}
    />
  );
}
