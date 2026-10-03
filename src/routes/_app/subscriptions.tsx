import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { CURRENCY_OPTIONS } from "@/components/entity-dialog";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { errMsg, fxQuery, rowsQuery, invalidateFor } from "@/lib/queries";
import { paySubscription } from "@/lib/finance.functions";
import { dateLabel, diffDays, todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import type { Account, Category, Subscription } from "@/lib/schemas";

export const Route = createFileRoute("/_app/subscriptions")({
  head: () => pageHead("Langganan", "Kelola langganan bulanan dan tahunan dalam IDR maupun USD."),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(rowsQuery("subscriptions")), context.queryClient.ensureQueryData(fxQuery())]),
  errorComponent: RouteError,
  component: SubsPage,
});

function SubsPage() {
  const { t, lang } = useI18n();
  const locale = lang === "en" ? "en-US" : "id-ID";
  const subs = useSuspenseQuery(rowsQuery("subscriptions")).data as Subscription[];
  const { usdIdr } = useSuspenseQuery(fxQuery()).data;
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const categories = (useQuery(rowsQuery("categories")).data ?? []) as Category[];
  const pay = useServerFn(paySubscription);
  const qc = useQueryClient();
  const crud = useCrudDialog("subscriptions", { currency: "IDR", cycle: "monthly", next_due: todayStr(), active: true });
  const toIdr = (s: Subscription) => Number(s.amount) * (s.currency === "USD" ? usdIdr : 1);
  const active = subs.filter((s) => s.active);
  const monthly = active.reduce((a, s) => a + (s.cycle === "yearly" ? toIdr(s) / 12 : toIdr(s)), 0);
  const today = todayStr();

  async function doPay(s: Subscription) {
    try { const r = await pay({ data: { id: s.id } }); await Promise.all([invalidateFor(qc, "transactions"), invalidateFor(qc, "subscriptions")]); toast.success(`${t("Tercatat. Tagihan berikutnya")} ${dateLabel(r.next_due, locale)}`); } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <>
      <PageHeader title={t("Langganan")} subtitle={`1 USD = ${money(usdIdr)} (${t("kurs otomatis harian")})`} actions={<Button onClick={() => crud.openNew()}><Plus className="size-4" /> {t("Langganan")}</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card className="bg-ink p-5 text-ink-foreground"><p className="text-xs uppercase tracking-wider text-ink-muted">{t("Per bulan (setara)")}</p><p className="num mt-1 text-2xl font-semibold">{money(monthly)}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">{t("Per tahun (setara)")}</p><p className="num mt-1 text-2xl font-semibold">{money(monthly * 12)}</p></Card>
      </div>
      {subs.length === 0 ? <Empty text={t("Belum ada langganan. Tambahkan Netflix, Spotify, iCloud, ChatGPT…")} /> : (
        <Card className="divide-y">
          {subs.map((s) => {
            const left = diffDays(today, s.next_due);
            return (
              <div key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${s.active ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name} <Badge variant="outline" className="ml-1">{s.cycle === "yearly" ? t("Tahunan") : t("Bulanan")}</Badge></p>
                  <p className={`text-xs ${left < 0 ? "text-expense" : left <= 3 ? "text-warning" : "text-muted-foreground"}`}>{t("Jatuh tempo")} {dateLabel(s.next_due, locale)} {left < 0 ? `(${t("terlambat")} ${-left} ${t("hari")})` : left === 0 ? `(${t("hari ini")})` : `(${left} ${t("hari lagi")})`}</p>
                </div>
                <div className="text-right">
                  <p className="num font-semibold">{money(s.amount, s.currency)}</p>
                  {s.currency === "USD" ? <p className="num text-xs text-muted-foreground">≈ {money(toIdr(s))}</p> : null}
                </div>
                {s.active ? <Button size="sm" variant="outline" onClick={() => doPay(s)}><CheckCircle2 className="size-4" /> {t("Sudah bayar")}</Button> : null}
                <RowActions onEdit={() => crud.openEdit({ ...s })} onDelete={() => crud.remove(s.id, s.name)} />
              </div>
            );
          })}
        </Card>
      )}
      {crud.dialog(t("langganan"), [
        { name: "name", label: t("Nama layanan"), type: "text", placeholder: "Netflix, ChatGPT Plus…" },
        { name: "amount", label: t("Harga"), type: "number", half: true },
        { name: "currency", label: t("Mata uang"), type: "select", half: true, options: CURRENCY_OPTIONS },
        { name: "cycle", label: t("Siklus"), type: "select", half: true, options: [{ value: "monthly", label: t("Bulanan") }, { value: "yearly", label: t("Tahunan") }] },
        { name: "next_due", label: t("Tagihan berikutnya"), type: "date", half: true },
        { name: "account_id", label: t("Dibayar dari"), type: "select", half: true, options: [{ value: "", label: "—" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))] },
        { name: "category_id", label: t("Kategori"), type: "select", half: true, options: [{ value: "", label: t("Langganan (default)") }, ...categories.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.name }))] },
        { name: "active", label: t("Aktif"), type: "switch" },
        { name: "notes", label: t("Catatan"), type: "textarea" },
      ])}
    </>
  );
}
