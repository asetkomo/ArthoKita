import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Banknote, ChevronLeft, ChevronRight, Download, MoreHorizontal, Paperclip, Pencil, Plus, Printer, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import { SortButton, type SortDirection } from "@/components/sort-button";
import { RouteError } from "@/components/route-error";
import { TransactionDialog, newTxDraft, type TxDraft } from "@/components/transaction-dialog";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errMsg, invalidateFor, rowsQuery, txCountQuery, txQuery, type TxFilter } from "@/lib/queries";
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
  const [sort, setSort] = useState<"occurred_at" | "amount" | "description">("occurred_at");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const categories = (useQuery(rowsQuery("categories")).data ?? []) as Category[];
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const filter: TxFilter = { month, ...(kind !== "all" ? { kind } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(categoryId ? { category_id: categoryId } : {}), ...(accountId ? { account_id: accountId } : {}), offset, sort, direction };
  const { offset: _skip, ...baseFilter } = filter;
  const { data: rows = [], isFetching } = useQuery({ ...txQuery(filter), placeholderData: (p) => p });
  const { data: total = 0 } = useQuery({ ...txCountQuery(baseFilter), placeholderData: (p) => p });
  const [dlg, setDlg] = useState<{ open: boolean; draft: TxDraft; id: string | null }>({ open: false, draft: newTxDraft(), id: null });
  const del = useServerFn(deleteRow);
  const exp = useServerFn(exportTransactionsCsv);
  const imp = useServerFn(importTransactionsCsv);
  const receipt = useServerFn(getReceiptUrl);
  const [importing, setImporting] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
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
      await invalidateFor(qc, "transactions");
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
    try { await del({ data: { table: "transactions", id } }); await invalidateFor(qc, "transactions"); toast.success(t("Dihapus")); } catch (e) { toast.error(errMsg(e)); }
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

  function cashWithdraw() {
    const cash = accounts.find((a) => a.type === "cash" && !a.archived);
    const bank = accounts.find((a) => (a.type === "bank" || a.type === "ewallet") && !a.archived);
    if (!cash) toast.info(t("Buat akun bertipe Tunai dulu di halaman Akun agar tarik tunai tercatat."));
    setDlg({ open: true, id: null, draft: { ...newTxDraft("transfer"), account_id: bank?.id ?? null, to_account_id: cash?.id ?? null, description: t("Tarik tunai") } });
  }

  const list = rows as any[];
  function sortBy(column: typeof sort) {
    setDirection((current) => sort === column ? (current === "asc" ? "desc" : "asc") : column === "occurred_at" ? "desc" : "asc");
    setSort(column);
    setOffset(0);
  }

  return (
    <>
      <PageHeader
        title={t("Transaksi")}
        subtitle={t("Input manual, scan nota, atau kiriman dari bot — semua tercatat di sini.")}
        actions={
          <>
            <ReceiptScanner onDraft={(draft) => setDlg({ open: true, draft, id: null })} />
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={pickCsv} />
            <div className="hidden gap-2 lg:contents">
              <Button variant="outline" onClick={download}><Download className="size-4" /> {t("Excel (CSV)")}</Button>
              <Button variant="outline" disabled={importing} onClick={() => csvRef.current?.click()}>
                <Upload className="size-4" /> {importing ? t("Mengimpor…") : t("Impor CSV")}
              </Button>
              <Button variant="outline" onClick={() => window.print()}><Printer className="size-4" /> PDF</Button>
              <Button variant="outline" onClick={cashWithdraw}><Banknote className="size-4" /> {t("Tarik tunai")}</Button>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="lg:hidden"><MoreHorizontal className="size-4" /> {t("Aksi lainnya")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onSelect={cashWithdraw}><Banknote className="size-4" /> {t("Tarik tunai")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void download()}><Download className="size-4" /> {t("Excel (CSV)")}</DropdownMenuItem>
                <DropdownMenuItem disabled={importing} onSelect={() => csvRef.current?.click()}><Upload className="size-4" /> {importing ? t("Mengimpor…") : t("Impor CSV")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => window.print()}><Printer className="size-4" /> PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setDlg({ open: true, draft: newTxDraft(), id: null })}><Plus className="size-4" /> {t("Catat")}</Button>
          </>
        }
      />
      <Card className="no-print mb-4 grid grid-cols-1 items-center gap-3 p-3 sm:flex sm:flex-wrap">
        <div className="flex items-center justify-between gap-1 sm:justify-start">
          <Button size="icon" variant="ghost" onClick={() => { setMonth(shiftMonth(month, -1)); setOffset(0); }} aria-label={t("Sebelumnya")}><ChevronLeft className="size-4" /></Button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(month, locale)}</span>
          <Button size="icon" variant="ghost" onClick={() => { setMonth(shiftMonth(month, 1)); setOffset(0); }} aria-label={t("Berikutnya")}><ChevronRight className="size-4" /></Button>
        </div>
        <Tabs className="min-w-0 max-w-full" value={kind} onValueChange={(v) => { setKind(v as typeof kind); setOffset(0); }}>
          <TabsList className="no-scrollbar w-full max-w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="all">{t("Semua")}</TabsTrigger>
            <TabsTrigger value="income">{t("Masuk")}</TabsTrigger>
            <TabsTrigger value="expense">{t("Keluar")}</TabsTrigger>
            <TabsTrigger value="transfer">{t("Transfer")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v === "all" ? "" : v); setOffset(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t("Semua kategori")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Semua kategori")}</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountId} onValueChange={(v) => { setAccountId(v === "all" ? "" : v); setOffset(0); }}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder={t("Semua akun")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("Semua akun")}</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input className="min-w-0 flex-1 sm:max-w-xs" placeholder={t("Cari deskripsi / merchant…")} value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        {isFetching ? <span className="text-xs text-muted-foreground">{t("Memuat…")}</span> : null}
      </Card>
      <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">{t("Pemasukan")}</p><p className="num break-words text-lg font-semibold text-income">{money(totals.inc)}</p></Card>
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">{t("Pengeluaran")}</p><p className="num break-words text-lg font-semibold text-expense">{money(totals.exp)}</p></Card>
        <Card className="min-w-0 p-4"><p className="text-xs text-muted-foreground">{t("Selisih")}</p><p className="num break-words text-lg font-semibold">{money(totals.inc - totals.exp)}</p></Card>
      </div>
      <div className="no-print mb-2 flex max-w-full flex-wrap items-center gap-1" aria-label={t("Urutkan")}>
        <SortButton label={t("Tanggal transaksi")} active={sort === "occurred_at"} direction={direction} onClick={() => sortBy("occurred_at")} />
        <SortButton label={t("Jumlah")} active={sort === "amount"} direction={direction} onClick={() => sortBy("amount")} />
        <SortButton label={t("Deskripsi")} active={sort === "description"} direction={direction} onClick={() => sortBy("description")} />
      </div>
      <Card className="min-w-0 overflow-hidden">
        {list.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">{t("Belum ada transaksi di bulan ini.")}</p>
        ) : (
          <ul className="divide-y">
            {list.map((tx) => (
              <li key={tx.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:flex sm:gap-3 sm:px-4">
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
                <div className="shrink-0 text-right">
                  <p className={`num text-sm font-semibold ${tx.kind === "income" ? "text-income" : tx.kind === "expense" ? "text-expense" : ""}`}>{tx.kind === "income" ? "+" : tx.kind === "expense" ? "−" : ""}{money(tx.amount, tx.currency)}</p>
                  {tx.currency === "USD" ? <p className="num text-xs text-muted-foreground">{money(tx.amount_idr)}</p> : null}
                </div>
                <div className="no-print col-start-2 col-end-4 flex shrink-0 justify-self-end sm:col-auto sm:flex-row">
                  <Button size="icon" variant="ghost" aria-label={t("Ubah")} onClick={() => setDlg({ open: true, id: tx.id, draft: { kind: tx.kind, amount: tx.amount, currency: tx.currency, occurred_at: tx.occurred_at, account_id: tx.account_id, to_account_id: tx.to_account_id, category_id: tx.category_id, description: tx.description, merchant: tx.merchant, notes: tx.notes, source: tx.source, items: tx.items, receipt_path: tx.receipt_path } })}><Pencil className="size-4" /></Button>
                  <Button size="icon" variant="ghost" aria-label={t("Hapus")} onClick={() => remove(tx.id)}><Trash2 className="size-4" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
       <Pagination offset={offset} pageSize={PAGE_SIZE} total={total} visible={list.length} onChange={setOffset} />
      <TransactionDialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))} initial={dlg.draft} id={dlg.id} />
      {ask.element}
    </>
  );
}
