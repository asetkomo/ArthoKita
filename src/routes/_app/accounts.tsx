import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { CURRENCY_OPTIONS } from "@/components/entity-dialog";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { balancesQuery, rowsQuery } from "@/lib/queries";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/accounts")({
  head: () => pageHead("Akun", "Kelola rekening bank, e-wallet, kartu kredit, dan uang tunai."),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(balancesQuery()), context.queryClient.ensureQueryData(rowsQuery("accounts"))]),
  errorComponent: RouteError,
  component: AccountsPage,
});

function AccountsPage() {
  const { t } = useI18n();
  const { data: balances } = useSuspenseQuery(balancesQuery());
  const crud = useCrudDialog("accounts", { type: "bank", currency: "IDR", initial_balance: 0, archived: false, color: "#2f7d5b" });
  const TYPES = [
    { value: "bank", label: t("Bank") },
    { value: "ewallet", label: t("E-wallet") },
    { value: "cash", label: t("Tunai") },
    { value: "credit_card", label: t("Kartu kredit") },
    { value: "investment", label: t("Investasi") },
    { value: "other", label: t("Lainnya") },
  ];
  return (
    <>
      <PageHeader title={t("Akun & Dompet")} subtitle={t("Saldo dihitung otomatis dari saldo awal + semua transaksi.")} actions={<Button onClick={() => crud.openNew()}><Plus className="size-4" /> {t("Akun baru")}</Button>} />
      {balances.length === 0 ? <Empty text={t("Belum ada akun. Tambahkan BCA, GoPay, tunai, dll.")} /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(balances as any[]).map((a) => (
            <Card key={a.id} className={`relative overflow-hidden p-5 ${a.archived ? "opacity-60" : ""}`}>
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: a.color ?? "var(--primary)" }} />
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display text-lg font-semibold">{a.name}</p>
                  <div className="mt-1 flex gap-1.5"><Badge variant="secondary">{TYPES.find((ty) => ty.value === a.type)?.label}</Badge><Badge variant="outline">{a.currency}</Badge>{a.archived ? <Badge variant="outline">{t("Arsip")}</Badge> : null}</div>
                </div>
                <RowActions onEdit={() => crud.openEdit({ id: a.id, name: a.name, type: a.type, currency: a.currency, initial_balance: a.initial_balance, color: a.color, archived: a.archived })} onDelete={() => crud.remove(a.id, `${t("akun")} ${a.name}`)} />
              </div>
              <p className={`num mt-4 text-2xl font-semibold ${Number(a.balance) < 0 ? "text-expense" : ""}`}>{money(a.balance, a.currency)}</p>
            </Card>
          ))}
        </div>
      )}
      {crud.dialog(t("akun"), [
        { name: "name", label: t("Nama"), type: "text", placeholder: "BCA, GoPay, Dompet…" },
        { name: "type", label: t("Jenis"), type: "select", half: true, options: TYPES },
        { name: "currency", label: t("Mata uang"), type: "select", half: true, options: CURRENCY_OPTIONS },
        { name: "initial_balance", label: t("Saldo awal"), type: "number", half: true },
        { name: "color", label: t("Warna"), type: "color", half: true },
        { name: "archived", label: t("Arsipkan akun"), type: "switch" },
      ])}
    </>
  );
}
