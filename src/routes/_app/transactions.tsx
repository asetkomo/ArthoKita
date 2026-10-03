import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Paperclip, Pencil, Plus, Printer, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { TransactionDialog, newTxDraft, type TxDraft } from "@/components/transaction-dialog";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errMsg, txQuery, type TxFilter } from "@/lib/queries";
import { deleteRow, exportTransactionsCsv, getReceiptUrl, importTransactionsCsv } from "@/lib/finance.functions";
import { currentMonth, dateLabel, monthLabel, shiftMonth } from "@/lib/dates";
import { KIND_LABEL, money } from "@/lib/format";
import { pageHead } from "@/lib/head";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/transactions")({
  head: () => pageHead("Transaksi", "Catat dan kelola semua pemasukan, pengeluaran, dan transfer."),
  loader: ({ context }) => context.queryClient.ensureQueryData(txQuery({ month: currentMonth() })),
  errorComponent: RouteError,
  component: TransactionsPage,
});

function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [search, setSearch] = useState("");
  const filter: TxFilter = { month, ...(kind !== "all" ? { kind } : {}), ...(search.trim() ? { search: search.trim() } : {}) };
  const { data: rows = [], isFetching } = useQuery({ ...txQuery(filter), placeholderData: (p) => p });
  const [dlg, setDlg] = useState<{ open: boolean; draft: TxDraft; id: string | null }>({ open: false, draft: newTxDraft(), id: null });
  const del = useServerFn(deleteRow);
  const exp = useServerFn(exportTransactionsCsv);
  const imp = useServerFn(importTransactionsCsv);
  const receipt = useServerFn(getReceiptUrl);
  const [importing, setImporting] = useState(false);
  const qc = useQueryClient();

  async function openReceipt(path: string) {
    try {
      const { url } = await receipt({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (e) { toast.error(errMsg(e)); }
  }

  async function pickCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim()).length - 1;
      if (!confirm(`Impor ${Math.max(0, lines)} baris dari "${file.name}"?`)) return;
      const res = await imp({ data: { csv: text } });
      await qc.invalidateQueries();
      if (res.failed) toast.warning(res.message, { description: res.errors.join("\n") });
      else toast.success(res.message);
    } catch (err) { toast.error("Impor gagal", { description: errMsg(err) }); }
    finally { setImporting(false); }
  }

  const totals = (rows as any[]).reduce((a, t) => {
    if (t.kind === "income") a.inc += Number(t.amount_idr);
    if (t.kind === "expense") a.exp += Number(t.amount_idr);
    return a;
  }, { inc: 0, exp: 0 });

  async function remove(id: string) {
    if (!confirm("Hapus transaksi ini?")) return;
    try { await del({ data: { table: "transactions", id } }); await qc.invalidateQueries(); toast.success("Dihapus"); } catch (e) { toast.error(errMsg(e)); }
  }
  async function download() {
    try {
      const { csv } = await exp({ data: { month } });
      const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `transaksi-${month}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <>
      <PageHeader
        title="Transaksi"
        subtitle="Input manual, scan nota, atau kiriman dari bot — semua tercatat di sini."
        actions={
          <>
            <ReceiptScanner onDraft={(draft) => setDlg({ open: true, draft, id: null })} />
            <Button variant="outline" onClick={download}><Download className="size-4" /> Excel (CSV)</Button>
            <Button variant="outline" disabled={importing} asChild>
              <label className="cursor-pointer">
                <Upload className="size-4" /> {importing ? "Mengimpor…" : "Impor CSV"}
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={pickCsv} />
              </label>
            </Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> PDF</Button>
            <Button onClick={() => setDlg({ open: true, draft: newTxDraft(), id: null })}><Plus className="size-4" /> Catat</Button>
          </>
        }
      />
      <Card className="no-print mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Sebelumnya"><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
          <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Berikutnya"><ChevronRight className="size-4" /></Button>
        </div>
        <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <TabsList>
            <TabsTrigger value="all">Semua</TabsTrigger>
            <TabsTrigger value="income">Masuk</TabsTrigger>
            <TabsTrigger value="expense">Keluar</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input className="max-w-xs flex-1" placeholder="Cari deskripsi / merchant…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {isFetching ? <span className="text-xs text-muted-foreground">Memuat…</span> : null}
      </Card>
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pemasukan</p><p className="num text-lg font-semibold text-income">{money(totals.inc)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pengeluaran</p><p className="num text-lg font-semibold text-expense">{money(totals.exp)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Selisih</p><p className="num text-lg font-semibold">{money(totals.inc - totals.exp)}</p></Card>
      </div>
      <Card className="overflow-hidden">
        {(rows as any[]).length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Belum ada transaksi di bulan ini.</p>
        ) : (
          <ul className="divide-y">
            {(rows as any[]).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.category?.color ?? "var(--muted-foreground)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description || t.merchant || t.category?.name || KIND_LABEL[t.kind]}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateLabel(t.occurred_at)} · {t.kind === "transfer" ? `${t.account?.name ?? "?"} → ${t.to_account?.name ?? "?"}` : `${t.category?.name ?? "Tanpa kategori"}${t.account?.name ? ` · ${t.account.name}` : ""}`}
                  </p>
                </div>
                {t.source !== "web" ? <Badge variant="secondary" className="hidden sm:inline-flex">{t.source}</Badge> : null}
                {t.receipt_path ? (
                  <Button size="icon" variant="ghost" aria-label="Lihat nota" onClick={() => openReceipt(t.receipt_path)}><Paperclip className="size-4" /></Button>
                ) : null}
                <div className="text-right">
                  <p className={`num text-sm font-semibold ${t.kind === "income" ? "text-income" : t.kind === "expense" ? "text-expense" : ""}`}>{t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount, t.currency)}</p>
                  {t.currency === "USD" ? <p className="num text-xs text-muted-foreground">{money(t.amount_idr)}</p> : null}
                </div>
                <div className="no-print flex">
                  <Button size="icon" variant="ghost" aria-label="Ubah" onClick={() => setDlg({ open: true, id: t.id, draft: { kind: t.kind, amount: t.amount, currency: t.currency, occurred_at: t.occurred_at, account_id: t.account_id, to_account_id: t.to_account_id, category_id: t.category_id, description: t.description, merchant: t.merchant, notes: t.notes, source: t.source, items: t.items, receipt_path: t.receipt_path } })}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label="Hapus" onClick={() => remove(t.id)}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TransactionDialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))} initial={dlg.draft} id={dlg.id} />
    </>
  );
}
