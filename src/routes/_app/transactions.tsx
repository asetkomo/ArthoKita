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
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errMsg, rowsQuery, txCountQuery, txQuery, type TxFilter } from "@/lib/queries";
import { deleteRow, exportTransactionsCsv, getReceiptUrl, importTransactionsCsv } from "@/lib/finance.functions";
import { currentMonth, dateLabel, monthLabel, shiftMonth } from "@/lib/dates";
import { KIND_LABEL, money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import type { Account, Category } from "@/lib/schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAGE_SIZE = 50;

export const Route = createFileRoute("/_app/transactions")({
  head: () => pageHead("Transaksi", "Catat dan kelola semua pemasukan, pengeluaran, dan transfer."),
  loader: ({ context }) => context.queryClient.ensureQueryData(txQuery({ month: currentMonth() })),
  errorComponent: RouteError,
  component: TransactionsPage,
});

function TransactionsPage() {
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "id-ID";
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<"all" | "income" | "expense" | "transfer">("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [offset, setOffset] = useState(0);
  const categories = (useQuery(rowsQuery("categories")).data ?? []) as Category[];
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const filter: TxFilter = { month, ...(kind !== "all" ? { kind } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(categoryId ? { category_id: categoryId } : {}), ...(accountId ? { account_id: accountId } : {}), offset };
  const { offset: _skip, ...baseFilter } = filter;
  const { data: rows = [], isFetching } = useQuery({ ...txQuery(filter), placeholderData: (p) => p });
  const { data: total = 0 } = useQuery({ ...txCountQuery(baseFilter), placeholderData: (p) => p });
  const [dlg, setDlg] = useState<{ open: boolean; draft: TxDraft; id: string | null }>({ open: false, draft: newTxDraft(), id: null });
  const del = useServerFn(deleteRow);
  const exp = useServerFn(exportTransactionsCsv);
  const imp = useServerFn(importTransactionsCsv);
  const receipt = useServerFn(getReceiptUrl);
  const [importing, setImporting] = useState(false);
  const qc = useQueryClient();
  const ask = useConfirm();

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
      if (!(await ask.confirm(t("Impor ") + Math.max(0, lines) + t(" baris?"), { description: `${t('Dari berkas "')}${file.name}${t('". ')}${t("Baris yang tidak valid akan dilewati dan dilaporkan.")}`, confirmLabel: t("Ya, impor") }))) return;
      const res = await imp({ data: { csv: text } });
      await qc.invalidateQueries();
      if (res.failed) toast.warning(res.message, { description: res.errors.join("\n") });
      else toast.success(res.message);
    } catch (err) { toast.error(t("Impor gagal"), { description: errMsg(err) }); }
    finally { setImporting(false); }
  }

  const totals = (rows as any[]).reduce((a, t) => {
    if (t.kind === "income") a.inc += Number(t.amount_idr);
    if (t.kind === "expense") a.exp += Number(t.amount_idr);
    return a;
  }, { inc: 0, exp: 0 });

  async function remove(id: string) {
    if (!(await ask.confirm(t("Hapus transaksi ini?"), { confirmLabel: t("Ya, hapus"), destructive: true }))) return;
    try { await del({ data: { table: "transactions", id } }); await qc.invalidateQueries(); toast.success(t("Dihapus")); } catch (e) { toast.error(errMsg(e)); }
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

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const list = rows as any[];

  return (
    <>
      <PageHeader
        title={t("Transaksi")}
        subtitle={t("Input manual, scan nota, atau kiriman dari bot — semua tercatat di sini.")}
        actions={
          <>
            <ReceiptScanner onDraft={(draft) => setDlg({ open: true, draft, id: null })} />
            <Button variant="outline" onClick={download}><Download className="size-4" /> {t("Excel (CSV)")}</Button>
            <Button variant="outline" disabled={importing} asChild>
              <label className="cursor-pointer">
                <Upload className="size-4" /> {importing ? t("Mengimpor…") : t("Impor CSV")}
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={pickCsv} />
              </label>
            </Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> PDF</Button>
            <Button onClick={() => setDlg({ open: true, draft: newTxDraft(), id: null })}><Plus className="size-4" /> {t("Catat")}</Button>
          </>
        }
      />
      <Card className="no-print mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => { setMonth(shiftMonth(month, -1)); setOffset(0); }} aria-label={t("Sebelumnya")}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(month, locale)}</span>
          <Button size="icon" variant="ghost" onClick={() => { setMonth(shiftMonth(month, 1)); setOffset(0); }} aria-label={t("Berikutnya")}><ChevronRight className="size-4" /></Button>
        </div>
        <Tabs value={kind} onValueChange={(v) => { setKind(v as typeof kind); setOffset(0); }}>
          <TabsList>
            <TabsTrigger value="all">{t("Semua")}</TabsTrigger>
            <TabsTrigger value="income">{t("Masuk")}</TabsTrigger>
            <TabsTrigger value="expense">{t("Keluar")}</TabsTrigger>
            <TabsTrigger value="transfer">{t("Transfer")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v === "all" ? "" : v); setOffset(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("Semua kategori")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Semua kategori")}</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountId} onValueChange={(v) => { setAccountId(v === "all" ? "" : v); setOffset(0); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("Semua akun")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Semua akun")}</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="max-w-xs flex-1" placeholder={t("Cari deskripsi / merchant…")} value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        {isFetching ? <span className="text-xs text-muted-foreground">{t("Memuat…")}</span> : null}
      </Card>
      <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("Pemasukan")}</p><p className="num text-lg font-semibold text-income">{money(totals.inc)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("Pengeluaran")}</p><p className="num text-lg font-semibold text-expense">{money(totals.exp)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t("Selisih")}</p><p className="num text-lg font-semibold">{money(totals.inc - totals.exp)}</p></Card>
      </div>
      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{t("Belum ada transaksi di bulan ini.")}</p>
        ) : (
          <ul className="divide-y">
            {list.map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: tx.category?.color ?? "var(--muted-foreground)" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tx.description || tx.merchant || tx.category?.name || KIND_LABEL[tx.kind]}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {dateLabel(tx.occurred_at, locale)} · {tx.kind === "transfer" ? `${tx.account?.name ?? "?"} → ${tx.to_account?.name ?? "?"}` : `${tx.category?.name ?? t("Tanpa kategori")}${tx.account?.name ? ` · ${tx.account.name}` : ""}`}
                  </p>
                </div>
                {tx.source !== "web" ? <Badge variant="secondary" className="hidden sm:inline-flex">{tx.source}</Badge> : null}
                {tx.receipt_path ? (
                  <Button size="icon" variant="ghost" aria-label={t("Lihat nota")} onClick={() => openReceipt(tx.receipt_path)}><Paperclip className="size-4" /></Button>
                ) : null}
                <div className="text-right">
                  <p className={`num text-sm font-semibold ${tx.kind === "income" ? "text-income" : tx.kind === "expense" ? "text-expense" : ""}`}>{tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}{money(tx.amount, tx.currency)}</p>
                  {tx.currency === "USD" ? <p className="num text-xs text-muted-foreground">{money(tx.amount_idr)}</p> : null}
                </div>
                <div className="no-print flex">
                  <Button size="icon" variant="ghost" aria-label={t("Ubah")} onClick={() => setDlg({ open: true, id: tx.id, draft: { kind: tx.kind, amount: tx.amount, currency: tx.currency, occurred_at: tx.occurred_at, account_id: tx.account_id, to_account_id: tx.to_account_id, category_id: tx.category_id, description: tx.description, merchant: tx.merchant, notes: tx.notes, source: tx.source, items: tx.items, receipt_path: tx.receipt_path } })}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("Hapus")} onClick={() => remove(tx.id)}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {total > PAGE_SIZE ? (
        <div className="no-print mt-3 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">{offset + 1}–{offset + list.length} {t("dari")} {total}</p>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} aria-label={t("Sebelumnya")}><ChevronLeft className="size-4" /></Button>
            <span className="px-2">{page} / {pages}</span>
            <Button size="icon" variant="outline" disabled={offset + list.length >= total} onClick={() => setOffset(offset + PAGE_SIZE)} aria-label={t("Berikutnya")}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      ) : null}
      <TransactionDialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))} initial={dlg.draft} id={dlg.id} />
      {ask.element}
    </>
  );
}
