import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Pagination } from "@/components/pagination";
import { SortButton, type SortDirection } from "@/components/sort-button";
import { RouteError } from "@/components/route-error";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { goldQuery, rowsQuery } from "@/lib/queries";
import { goldValue, type GoldPrice } from "@/lib/assets";
import { dateLabel, todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/gold")({
  head: () => pageHead("Tabungan Emas", "Catat pembelian dan penjualan emas, pantau nilai dengan harga dunia dan Antam."),
  loader: ({ context }) => context.queryClient.ensureQueryData(goldQuery()),
  errorComponent: RouteError,
  component: GoldPage,
});

function GoldPage() {
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "id-ID";
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<"occurred_at" | "grams" | "price_per_gram" | "total">("occurred_at");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const pageSize = 25;
  const { data, isFetching } = useQuery({ ...goldQuery({ offset, limit: pageSize, sort, direction }), placeholderData: (p) => p });
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as { id: string; name: string; archived?: boolean }[];
  const accName = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name;
  const crud = useCrudDialog("gold_purchases", { kind: "buy", occurred_at: todayStr(), place: "Antam" });

  function sortBy(column: typeof sort) {
    setDirection((current) => sort === column ? (current === "asc" ? "desc" : "asc") : column === "occurred_at" ? "desc" : "asc");
    setSort(column);
    setOffset(0);
  }

  if (!data) return null;
  if (!data.ready) {
    return (
      <>
        <PageHeader title={t("Tabungan Emas")} />
        <Empty text={t("Tabel emas belum ada. Jalankan bagian v3 di supabase/schema.sql lewat SQL Editor Supabase.")} />
      </>
    );
  }
  const { rows, holdings, prices, total } = data as { rows: any[]; total: number; holdings: { grams: number; cost: number; avgPrice: number; realized: number }; prices: { world: GoldPrice | null; antam: GoldPrice | null } };

  return (
    <>
      <PageHeader title={t("Tabungan Emas")} subtitle={`${t("Nilai dihitung dari harga buyback per gram.")} ${t("Pilih akun agar beli/jual emas otomatis tercatat di Transaksi.")}`} actions={<Button onClick={() => crud.openNew()}><Plus className="size-4" /> {t("Catat")}</Button>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Total emas")} value={`${holdings.grams.toLocaleString(locale)} g`} />
        <Stat label={t("Modal")} value={money(holdings.cost)} />
        <Stat label={t("Rata-rata harga beli")} value={`${money(holdings.avgPrice)}/g`} />
        <Stat label={t("Untung terealisasi")} value={money(holdings.realized)} tone={holdings.realized >= 0 ? "text-income" : "text-expense"} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {([prices.world, prices.antam] as const).map((p, i) => {
          const title = i === 0 ? t("Harga dunia (XAU)") : t("Antam / Pegadaian");
          const v = goldValue(holdings.grams, p, holdings.cost);
          return (
            <Card key={i} className="min-w-0 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{title}</h2>
                {p ? <Badge variant={p.estimated ? "outline" : "secondary"}>{p.estimated ? t("perkiraan") : dateLabel(p.date, locale)}</Badge> : null}
              </div>
              {p && v ? (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2">
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("Harga jual")}</p><p className="num break-words font-semibold">{money(p.buy)}/g</p></div>
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">{t("Buyback")}</p><p className="num break-words font-semibold">{money(p.buyback)}/g</p></div>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">{t("Nilai sekarang")}</p>
                  <p className="num break-words font-display text-2xl font-bold">{money(v.value)}</p>
                  <p className={`num break-words text-sm font-semibold ${v.pnl >= 0 ? "text-income" : "text-expense"}`}>{v.pnl >= 0 ? "+" : "−"}{money(Math.abs(v.pnl))} ({v.pnlPct.toFixed(1)}%)</p>
                </>
              ) : <p className="mt-3 text-sm text-muted-foreground">{t("Harga belum tersedia, coba lagi nanti.")}</p>}
            </Card>
          );
        })}
      </div>
       <div className="no-print mt-4 flex max-w-full flex-wrap items-center gap-1" aria-label={t("Urutkan")}>
         <SortButton label={t("Tanggal transaksi")} active={sort === "occurred_at"} direction={direction} onClick={() => sortBy("occurred_at")} />
         <SortButton label={t("Gram")} active={sort === "grams"} direction={direction} onClick={() => sortBy("grams")} />
         <SortButton label={t("Harga per gram")} active={sort === "price_per_gram"} direction={direction} onClick={() => sortBy("price_per_gram")} />
         <SortButton label={t("Total")} active={sort === "total"} direction={direction} onClick={() => sortBy("total")} />
         {isFetching ? <span className="ml-auto text-xs text-muted-foreground">{t("Memuat…")}</span> : null}
       </div>
       <Card className="mt-2 overflow-hidden">
        {rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{t("Belum ada catatan emas.")}</p> : (
          <ul className="divide-y">
            {rows.map((r) => (
               <li key={r.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <Badge variant={r.kind === "buy" ? "secondary" : "outline"} className="shrink-0">{r.kind === "buy" ? t("Beli") : t("Jual")}</Badge>
                <div className="min-w-0 flex-1">
                   <p className="truncate text-sm font-medium">{r.grams} g{r.gold_type ? ` · ${r.gold_type}` : ""}{r.place ? ` · ${r.place}` : ""}</p>
                   <p className="truncate text-xs text-muted-foreground">{dateLabel(r.occurred_at, locale)} · {money(r.price_per_gram)}/g{r.product_number ? ` · ${r.product_number}` : ""}{accName(r.account_id) ? ` · ${accName(r.account_id)}` : ""}</p>
                </div>
                 <p className="num shrink-0 text-sm font-semibold">{money(r.total)}</p>
                 <div className="col-start-2 col-end-4 justify-self-end sm:col-auto"><RowActions onEdit={() => crud.openEdit({ id: r.id, kind: r.kind, occurred_at: r.occurred_at, grams: r.grams, price_per_gram: r.price_per_gram, total: r.total, place: r.place, gold_type: r.gold_type, product_number: r.product_number, account_id: r.account_id ?? "", notes: r.notes })} onDelete={() => crud.remove(r.id, `${r.grams} g`)} /></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
       <Pagination offset={offset} pageSize={pageSize} total={total} visible={rows.length} onChange={setOffset} />
      {crud.dialog(t("emas"), [
        { name: "kind", label: t("Jenis"), type: "select", half: true, options: [{ value: "buy", label: t("Beli") }, { value: "sell", label: t("Jual") }] },
        { name: "occurred_at", label: t("Tanggal"), type: "date", half: true },
        { name: "grams", label: t("Gram"), type: "number", half: true, step: "0.0001" },
        { name: "price_per_gram", label: t("Harga per gram"), type: "number", half: true },
        { name: "total", label: t("Total (kosongkan = otomatis)"), type: "number", half: true },
        { name: "place", label: t("Tempat"), type: "text", half: true, placeholder: "Antam, Pegadaian, Tokopedia…" },
         { name: "gold_type", label: t("Tipe emas (opsional)"), type: "text", half: true, placeholder: "Antam CertiCard, UBS…" },
         { name: "product_number", label: t("Nomor produk / nomor emas (opsional)"), type: "text", half: true },
        { name: "account_id", label: t("Akun pembayaran (opsional)"), type: "select", options: [{ value: "", label: t("— Tanpa transaksi —") }, ...accounts.filter((a) => !a.archived).map((a) => ({ value: a.id, label: a.name }))] },
        { name: "notes", label: t("Catatan"), type: "textarea" },
      ])}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="min-w-0 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`num break-words text-base font-semibold sm:text-lg ${tone ?? ""}`}>{value}</p>
    </Card>
  );
}
