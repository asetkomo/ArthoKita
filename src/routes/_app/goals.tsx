import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { EntityDialog, type FieldDef } from "@/components/entity-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { errMsg, rowsQuery, invalidateFor } from "@/lib/queries";
import { addGoalFunds } from "@/lib/finance.functions";
import { dateLabel, diffDays, todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";
import type { Account, Goal } from "@/lib/schemas";

export const Route = createFileRoute("/_app/goals")({
  head: () =>
    pageHead("Target Tabungan", "Pantau progres tabungan untuk setiap tujuan keuanganmu."),
  loader: ({ context }) => context.queryClient.ensureQueryData(rowsQuery("goals")),
  errorComponent: RouteError,
  component: GoalsPage,
});

type Funds = { open: boolean; goal: Goal | null; sign: 1 | -1; initial: Record<string, unknown> };

function GoalsPage() {
  const { t } = useI18n();
  const goals = useSuspenseQuery(rowsQuery("goals")).data as Goal[];
  const accounts = ((useQuery(rowsQuery("accounts")).data ?? []) as Account[]).filter(
    (a) => !a.archived,
  );
  const crud = useCrudDialog("goals", { saved_amount: 0, color: "#c99a2e" });
  const add = useServerFn(addGoalFunds);
  const qc = useQueryClient();
  const [funds, setFunds] = useState<Funds>({ open: false, goal: null, sign: 1, initial: {} });
  const accName = (id: string | null | undefined) =>
    accounts.find((a) => a.id === id)?.name ?? null;
  const accOptions = [
    { value: "", label: t("— Tanpa akun —") },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];

  function openFunds(g: Goal, sign: 1 | -1) {
    const others = accounts.filter((a) => a.id !== g.account_id);
    const def = others.find((a) => a.type === "bank") ?? others[0];
    const saved = Number(g.saved_amount);
    setFunds({
      open: true,
      goal: g,
      sign,
      initial: {
        amount: sign < 0 && saved > 0 ? saved : "",
        date: todayStr(),
        account_id: g.account_id ? (def?.id ?? "") : "",
      },
    });
  }

  const g = funds.goal;
  const linked = g?.account_id ? accName(g.account_id) : null;
  const fundFields: FieldDef[] = [
    { name: "amount", label: t("Nominal"), type: "number", half: true },
    { name: "date", label: t("Tanggal"), type: "date", half: true },
    ...(linked
      ? [
          {
            name: "account_id",
            label: funds.sign > 0 ? t("Dari akun") : t("Masuk ke akun"),
            type: "select" as const,
            options: accOptions.filter((o) => o.value !== g?.account_id),
          },
        ]
      : []),
  ];
  const fundHint = !g
    ? undefined
    : linked
      ? `${funds.sign > 0 ? t("Dicatat sebagai transfer dari akun pilihan ke") : t("Dicatat sebagai transfer dari")} ${linked}${funds.sign > 0 ? "" : ` ${t("ke akun pilihan")}`}. ${t("Tanpa akun, hanya angka target yang berubah.")}`
      : t(
          "Target ini belum punya akun tabungan, jadi hanya angka target yang berubah. Pilih akun tabungan di Ubah target agar tercatat sebagai transfer.",
        );

  return (
    <>
      <PageHeader
        title={t("Target Tabungan")}
        subtitle={t("Dana darurat, liburan, DP rumah…")}
        actions={
          <Button onClick={() => crud.openNew()}>
            <Plus className="size-4" /> {t("Target")}
          </Button>
        }
      />
      {goals.length === 0 ? (
        <Empty text={t("Belum ada target tabungan.")} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((x) => (
            <GoalCard
              key={x.id}
              g={x}
              account={accName(x.account_id)}
              onFunds={(sign) => openFunds(x, sign)}
              onEdit={() => crud.openEdit({ ...x })}
              onDelete={() => crud.remove(x.id, x.name)}
            />
          ))}
        </div>
      )}
      {crud.dialog(t("target"), [
        { name: "name", label: t("Nama target"), type: "text" },
        { name: "target_amount", label: t("Target (IDR)"), type: "number", half: true },
        { name: "saved_amount", label: t("Sudah terkumpul"), type: "number", half: true },
        { name: "deadline", label: t("Tenggat (opsional)"), type: "date", half: true },
        { name: "color", label: t("Warna"), type: "color", half: true },
        {
          name: "account_id",
          label: t("Akun tabungan (opsional)"),
          type: "select",
          options: accOptions,
        },
      ])}
      <EntityDialog
        open={funds.open}
        onOpenChange={(o) => setFunds((s) => ({ ...s, open: o }))}
        title={`${funds.sign > 0 ? t("Tambah nominal") : t("Tarik dana")}${g ? ` · ${g.name}` : ""}`}
        description={fundHint}
        initial={funds.initial}
        fields={fundFields}
        onSubmit={async (v) => {
          if (!g) return;
          const n = Number(v["amount"]);
          if (!(n > 0)) throw new Error(t("Jumlah harus lebih dari 0"));
          await add({
            data: {
              id: g.id,
              amount: n * funds.sign,
              account_id: linked ? (v["account_id"] as string) || null : null,
              date: (v["date"] as string) || null,
            },
          });
          await Promise.all([invalidateFor(qc, "transactions"), invalidateFor(qc, "goals")]);
        }}
      />
    </>
  );
}

function GoalCard({
  g,
  account,
  onFunds,
  onEdit,
  onDelete,
}: {
  g: Goal;
  account: string | null;
  onFunds: (sign: 1 | -1) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const saved = Number(g.saved_amount);
  const target = Number(g.target_amount);
  const pct = target ? (saved / target) * 100 : 0;
  const daysLeft = g.deadline ? diffDays(todayStr(), g.deadline) : null;
  const perMonth =
    daysLeft && daysLeft > 0 ? Math.max(0, target - saved) / Math.max(1, daysLeft / 30) : null;
  return (
    <Card className="min-w-0 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 font-display text-lg font-semibold">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ background: g.color ?? "var(--accent)" }}
          />
          <span className="truncate">{g.name}</span>
        </p>
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <p className="mt-3 break-words">
        <span className="num text-xl font-semibold">{money(saved)}</span>{" "}
        <span className="text-sm text-muted-foreground">/ {money(target)}</span>
      </p>
      <Progress className="mt-3" value={Math.min(100, pct)} />
      <p className="mt-2 break-words text-xs text-muted-foreground">
        {Math.round(pct)}%{g.deadline ? ` · ${t("tenggat")} ${dateLabel(g.deadline)}` : ""}
        {perMonth ? ` · ${t("perlu")} ${money(perMonth)}/${t("bln")}` : ""}
      </p>
      {account ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {t("Akun tabungan")}: {account}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="min-w-0" onClick={() => onFunds(1)}>
          <ArrowDownToLine className="size-4 shrink-0" />{" "}
          <span className="truncate">{t("Tambah nominal")}</span>
        </Button>
        <Button
          variant="outline"
          className="min-w-0"
          disabled={saved <= 0}
          onClick={() => onFunds(-1)}
        >
          <ArrowUpFromLine className="size-4 shrink-0" />{" "}
          <span className="truncate">{t("Tarik dana")}</span>
        </Button>
      </div>
    </Card>
  );
}
