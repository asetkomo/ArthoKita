import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { CURRENCY_OPTIONS } from "@/components/entity-dialog";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { debtsQuery, errMsg, rowsQuery } from "@/lib/queries";
import { deleteRow, payDebt } from "@/lib/finance.functions";
import { dateLabel, todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";
import type { Account } from "@/lib/schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/debts")({
  head: () => pageHead("Hutang & Cicilan", "Pantau paylater, pinjaman, dan cicilan beserta jatuh temponya."),
  loader: ({ context }) => context.queryClient.ensureQueryData(debtsQuery()),
  errorComponent: RouteError,
  component: DebtsPage,
});

const KINDS = [
  { value: "paylater", label: "Paylater" },
  { value: "loan", label: "Pinjaman" },
  { value: "credit_card", label: "Cicilan kartu kredit" },
  { value: "personal", label: "Hutang pribadi" },
  { value: "other", label: "Lainnya" },
];

function DebtsPage() {
  const { data: debts } = useSuspenseQuery(debtsQuery());
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const pay = useServerFn(payDebt);
  const del = useServerFn(deleteRow);
  const qc = useQueryClient();
  const crud = useCrudDialog("debts", { kind: "paylater", currency: "IDR", start_date: todayStr(), due_day: 5, total_installments: 3, status: "active" });
  const ask = useConfirm();
  const active = (debts as any[]).filter((d) => d.status === "active");
  const totalRemaining = active.reduce((a, d) => a + (d.currency === "IDR" ? d.remaining_amount : 0), 0);

  async function doPay(d: any) {
    if (!(await ask.confirm(`Catat pembayaran cicilan ke-${d.paid_count + 1}?`, { description: `${d.name} · ${money(d.installment_amount, d.currency)} — otomatis tercatat sebagai pengeluaran.`, confirmLabel: "Ya, catat" }))) return;
    try { await pay({ data: { debt_id: d.id } }); await qc.invalidateQueries(); toast.success("Cicilan tercatat & masuk ke pengeluaran"); } catch (e) { toast.error(errMsg(e)); }
  }
  async function undo(id: string) {
    if (!(await ask.confirm("Batalkan pembayaran ini?", { description: "Transaksi pengeluaran terkait juga akan dihapus.", confirmLabel: "Ya, batalkan", destructive: true }))) return;
    try { await del({ data: { table: "debt_payments", id } }); await qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); }
  }

  return (
    <>
      <PageHeader title="Hutang & Cicilan" subtitle={`Sisa kewajiban (IDR): ${money(totalRemaining)}`} actions={<Button onClick={() => crud.openNew()}><Plus className="size-4" /> Tambah</Button>} />
      {debts.length === 0 ? <Empty text="Belum ada hutang/cicilan. Tambahkan paylater, KTA, atau pinjaman teman." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(debts as any[]).map((d) => {
            const pct = (d.paid_count / d.total_installments) * 100;
            return (
              <Card key={d.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-semibold">{d.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{KINDS.find((k) => k.value === d.kind)?.label}</Badge>
                      {d.provider ? <Badge variant="outline">{d.provider}</Badge> : null}
                      {d.status === "paid_off" ? <Badge className="bg-income text-primary-foreground">Lunas</Badge> : null}
                    </div>
                  </div>
                  <RowActions onEdit={() => crud.openEdit({ id: d.id, name: d.name, provider: d.provider, kind: d.kind, currency: d.currency, total_amount: d.total_amount, installment_amount: d.installment_amount, total_installments: d.total_installments, start_date: d.start_date, due_day: d.due_day, interest_rate: d.interest_rate, account_id: d.account_id, notes: d.notes, status: d.status })} onDelete={() => crud.remove(d.id, d.name)} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Per cicilan</p><p className="num font-semibold">{money(d.installment_amount, d.currency)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Sisa</p><p className="num font-semibold text-expense">{money(d.remaining_amount, d.currency)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Jatuh tempo</p><p className="font-semibold">{d.next_due ? dateLabel(d.next_due) : "-"}</p></div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{d.paid_count}/{d.total_installments} cicilan</span><span>{Math.round(pct)}%</span></div>
                  <Progress value={pct} />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {d.status === "active" ? <Button size="sm" onClick={() => doPay(d)}><CheckCircle2 className="size-4" /> Bayar cicilan ke-{d.paid_count + 1}</Button> : null}
                  {d.payments.length ? (
                    <Collapsible className="w-full">
                      <CollapsibleTrigger className="text-xs text-primary">Riwayat pembayaran ({d.payments.length})</CollapsibleTrigger>
                      <CollapsibleContent>
                        <ul className="mt-2 divide-y rounded-lg border text-sm">
                          {d.payments.map((p: any) => (
                            <li key={p.id} className="flex items-center justify-between px-3 py-1.5">
                              <span>#{p.installment_no} · {dateLabel(p.paid_at)}</span>
                              <span className="flex items-center gap-2"><span className="num">{money(p.amount, d.currency)}</span><Button size="icon" variant="ghost" className="size-7" aria-label="Batalkan" onClick={() => undo(p.id)}><Undo2 className="size-3.5" /></Button></span>
                            </li>
                          ))}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {crud.dialog("hutang / cicilan", [
        { name: "name", label: "Nama", type: "text", placeholder: "HP baru via Shopee PayLater" },
        { name: "kind", label: "Jenis", type: "select", half: true, options: KINDS },
        { name: "provider", label: "Penyedia", type: "text", half: true, placeholder: "Kredivo, Akulaku, Bank…" },
        { name: "total_amount", label: "Total pinjaman", type: "number", half: true },
        { name: "currency", label: "Mata uang", type: "select", half: true, options: CURRENCY_OPTIONS },
        { name: "installment_amount", label: "Cicilan per bulan", type: "number", half: true },
        { name: "total_installments", label: "Jumlah cicilan (bulan)", type: "number", half: true },
        { name: "start_date", label: "Bulan cicilan pertama", type: "date", half: true },
        { name: "due_day", label: "Tanggal jatuh tempo (1-31)", type: "number", half: true },
        { name: "interest_rate", label: "Bunga % (opsional)", type: "number", half: true },
        { name: "account_id", label: "Dibayar dari akun", type: "select", half: true, options: [{ value: "", label: "—" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))] },
        { name: "status", label: "Status", type: "select", half: true, options: [{ value: "active", label: "Aktif" }, { value: "paid_off", label: "Lunas" }] },
        { name: "notes", label: "Catatan", type: "textarea" },
      ])}
      {ask.element}
    </>
  );
}
