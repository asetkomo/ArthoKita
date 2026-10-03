import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { Empty, RowActions, useCrudDialog } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { errMsg, rowsQuery } from "@/lib/queries";
import { addGoalFunds } from "@/lib/finance.functions";
import { dateLabel, diffDays, todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";
import type { Goal } from "@/lib/schemas";

export const Route = createFileRoute("/_app/goals")({
  head: () => pageHead("Target Tabungan", "Pantau progres tabungan untuk setiap tujuan keuanganmu."),
  loader: ({ context }) => context.queryClient.ensureQueryData(rowsQuery("goals")),
  errorComponent: RouteError,
  component: GoalsPage,
});

function GoalsPage() {
  const goals = useSuspenseQuery(rowsQuery("goals")).data as Goal[];
  const crud = useCrudDialog("goals", { saved_amount: 0, color: "#c99a2e" });
  return (
    <>
      <PageHeader title="Target Tabungan" subtitle="Dana darurat, liburan, DP rumah…" actions={<Button onClick={() => crud.openNew()}><Plus className="size-4" /> Target</Button>} />
      {goals.length === 0 ? <Empty text="Belum ada target tabungan." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => <GoalCard key={g.id} g={g} onEdit={() => crud.openEdit({ ...g })} onDelete={() => crud.remove(g.id, g.name)} />)}
        </div>
      )}
      {crud.dialog("target", [
        { name: "name", label: "Nama target", type: "text" },
        { name: "target_amount", label: "Target (IDR)", type: "number", half: true },
        { name: "saved_amount", label: "Sudah terkumpul", type: "number", half: true },
        { name: "deadline", label: "Tenggat (opsional)", type: "date", half: true },
        { name: "color", label: "Warna", type: "color", half: true },
      ])}
    </>
  );
}

function GoalCard({ g, onEdit, onDelete }: { g: Goal; onEdit: () => void; onDelete: () => void }) {
  const [amt, setAmt] = useState("");
  const add = useServerFn(addGoalFunds);
  const qc = useQueryClient();
  const saved = Number(g.saved_amount);
  const target = Number(g.target_amount);
  const pct = target ? (saved / target) * 100 : 0;
  const daysLeft = g.deadline ? diffDays(todayStr(), g.deadline) : null;
  const perMonth = daysLeft && daysLeft > 0 ? Math.max(0, target - saved) / Math.max(1, daysLeft / 30) : null;
  async function submit(sign: 1 | -1) {
    const n = Number(amt);
    if (!n) return;
    try { await add({ data: { id: g.id, amount: n * sign } }); setAmt(""); await qc.invalidateQueries(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="flex items-center gap-2 font-display text-lg font-semibold"><span className="size-3 rounded-full" style={{ background: g.color ?? "var(--accent)" }} />{g.name}</p>
        <RowActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <p className="mt-3"><span className="num text-xl font-semibold">{money(saved)}</span> <span className="text-sm text-muted-foreground">/ {money(target)}</span></p>
      <Progress className="mt-3" value={Math.min(100, pct)} />
      <p className="mt-2 text-xs text-muted-foreground">{Math.round(pct)}%{g.deadline ? ` · tenggat ${dateLabel(g.deadline)}` : ""}{perMonth ? ` · perlu ${money(perMonth)}/bln` : ""}</p>
      <div className="mt-4 flex gap-2">
        <Input className="num" inputMode="decimal" placeholder="Nominal" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <Button variant="secondary" onClick={() => submit(1)}>+ Tambah</Button>
        <Button variant="ghost" onClick={() => submit(-1)}>−</Button>
      </div>
    </Card>
  );
}
