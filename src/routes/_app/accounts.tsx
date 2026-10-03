import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { RowActions, useCrudDialog } from "@/components/crud-page";
import { deleteRow } from "@/lib/finance.functions";
import { rowsQuery } from "@/lib/queries";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import type { Account } from "@/lib/schemas";

export const Route = createFileRoute("/_app/accounts")({
  head: () => pageHead("Akun", "Bank, dompet digital, tunai, dan tabungan."),
  loader: ({ context }) => context.queryClient.ensureQueryData(rowsQuery("accounts")),
  errorComponent: RouteError,
  component: AccountsPage,
});

const TYPE_LABELS: Record<string, string> = {
  bank: "Bank",
  ewallet: "E-wallet",
  cash: "Tunai",
  credit_card: "Kartu Kredit",
  investment: "Investasi",
  other: "Lainnya",
};

function AccountsPage() {
  const { t, lang } = useI18n();
  const rows = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const qc = useQueryClient();
  const remove = useServerFn(deleteRow);
  const crud = useCrudDialog("accounts", { name: "", type: "bank", currency: "IDR", initial_balance: 0, color: "#2f7d5b", archived: false });
  const typeLabel = (v: string) => (lang === "en" ? { bank: "Bank", ewallet: "E-wallet", cash: "Cash", credit_card: "Credit Card", investment: "Investment", other: "Other" }[v] ?? v : TYPE_LABELS[v] ?? v);

  async function archive(a: Account) {
    try {
      const { saveRow } = await import("@/lib/finance.functions");
      await (useServerFnSave())({ data: { table: "accounts", id: a.id, values: { ...a, archived: !a.archived } } });
    } catch (e) {
      toast.error(String(e));
    }
  }
  const useServerFnSave = () => useServerFnSave._fn ?? (useServerFnSave._fn = useServerFn(saveRowFn));
  function saveRowFn() { return null as never; }

  void remove; void qc; void archive;

  return (
    <>
      <PageHeader title={t("Akun")} subtitle={t("Semua dompet, bank, dan kartu Anda.")} actions={<Button onClick={() => crud.openNew()}><Wallet className="size-4" /> {t("Tambah akun")}</Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.filter((a) => !a.archived).map((a) => (
          <Card key={a.id} className="relative overflow-hidden p-5">
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: a.color ?? "var(--muted)" }} />
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{a.name}</p>
                <p className="text-xs text-muted-foreground">{typeLabel(a.type)}</p>
              </div>
              <RowActions onEdit={() => crud.openEdit({ ...a })} onDelete={() => crud.remove(a.id, `akun ${a.name}`)} />
            </div>
            <p className={`num mt-4 text-2xl font-semibold ${a.balance < 0 ? "text-expense" : ""}`}>{money(a.balance, a.currency)}</p>
          </Card>
        ))}
      </div>
      {rows.some((a) => a.archived) ? (
        <>
          <h2 className="mt-8 mb-3 text-lg font-semibold">{t("Diarsipkan")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.filter((a) => a.archived).map((a) => (
              <Card key={a.id} className="p-5 opacity-60">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(a.type)}</p>
                  </div>
                  <RowActions onEdit={() => crud.openEdit({ ...a })} onDelete={() => crud.remove(a.id, `akun ${a.name}`)} />
                </div>
                <p className={`num mt-4 text-2xl font-semibold`}>{money(a.balance, a.currency)}</p>
              </Card>
            ))}
          </div>
        </>
      ) : null}
      {crud.dialog(t("akun"), [
        { name: "name", label: t("Nama"), type: "text" },
        { name: "type", label: t("Jenis"), type: "select", half: true, options: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })) },
        { name: "currency", label: t("Mata uang"), type: "select", half: true, options: [{ value: "IDR", label: "IDR" }, { value: "USD", label: "USD" }] },
        { name: "initial_balance", label: t("Saldo awal"), type: "number", half: true },
        { name: "color", label: t("Warna"), type: "color", half: true },
      ])}
    </>
  );
}
