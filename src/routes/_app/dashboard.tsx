import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { TransactionDialog, newTxDraft, type TxDraft } from "@/components/transaction-dialog";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { dashboardQuery } from "@/lib/queries";
import { currentMonth, dateLabel, monthLabel, shiftMonth, shortMonth } from "@/lib/dates";
import { compact, money } from "@/lib/format";
import { pageHead } from "@/lib/head";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/dashboard")({
  head: () => pageHead("Dashboard", "Ringkasan pemasukan, pengeluaran, saldo, hutang, dan pengingat bulan ini."),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashboardQuery(currentMonth())),
  errorComponent: RouteError,
  component: Dashboard,
});

const PIE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const { data: d } = useQuery({ ...dashboardQuery(month), placeholderData: (p) => p });
  const [dlg, setDlg] = useState<{ open: boolean; draft: TxDraft }>({ open: false, draft: newTxDraft() });
  if (!d) return null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Kurs hari ini: 1 USD = ${money(d.usdIdr)}`}
        actions={
          <>
            <ReceiptScanner onDraft={(draft) => setDlg({ open: true, draft })} />
            <Button variant="secondary" onClick={() => setDlg({ open: true, draft: newTxDraft("income") })}><Plus className="size-4" /> Pemasukan</Button>
            <Button onClick={() => setDlg({ open: true, draft: newTxDraft("expense") })}><Plus className="size-4" /> Pengeluaran</Button>
          </>
        }
      />

      <div className="mb-5 flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Bulan sebelumnya"><ChevronLeft className="size-4" /></Button>
        <p className="min-w-40 text-center font-display text-lg font-semibold capitalize">{monthLabel(month)}</p>
        <Button size="icon" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Bulan berikutnya"><ChevronRight className="size-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-ink p-5 text-ink-foreground">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Total saldo</p>
          <p className="num mt-2 text-2xl font-semibold">{money(d.totalBalanceIdr)}</p>
          <p className="mt-1 text-xs text-ink-muted">{d.balances.length} akun aktif</p>
        </Card>
        <Stat label="Pemasukan" value={d.income} tone="income" icon={<ArrowDownRight className="size-4" />} />
        <Stat label="Pengeluaran" value={d.expense} tone="expense" icon={<ArrowUpRight className="size-4" />} />
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Selisih bulan ini</p>
          <p className={`num mt-2 text-2xl font-semibold ${d.net >= 0 ? "text-income" : "text-expense"}`}>{money(d.net)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Hutang {money(d.debtOutstandingIdr)} · Langganan {money(d.subsMonthlyIdr)}/bln</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Arus kas 6 bulan</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.trend.map((t: any) => ({ ...t, label: shortMonth(t.month) }))}>
                <defs>
                  <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--income)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--income)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--expense)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--expense)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Area type="monotone" dataKey="income" name="Pemasukan" stroke="var(--income)" fill="url(#gi)" strokeWidth={2} />
                <Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="var(--expense)" fill="url(#ge)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-semibold">Pengeluaran per kategori</h2>
          {d.byCategory.length ? (
            <>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.byCategory} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                      {d.byCategory.map((c: any, i: number) => <Cell key={i} fill={c.color ?? PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {d.byCategory.slice(0, 5).map((c: any, i: number) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate"><span className="size-2.5 rounded-full" style={{ background: c.color ?? PIE[i % PIE.length] }} />{c.name}</span>
                    <span className="num text-muted-foreground">{money(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty text="Belum ada pengeluaran bulan ini." />}
        </Card>
      </div>

      {d.categoryTrend?.categories?.length ? (
        <Card className="mt-4 p-5">
          <h2 className="mb-4 text-lg font-semibold">Tren pengeluaran per kategori (6 bulan)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.categoryTrend.rows.map((r: any) => ({ ...r, label: shortMonth(r.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                <Legend />
                {d.categoryTrend.categories.map((c: string, i: number) => (
                  <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={PIE[i % PIE.length]} fill={PIE[i % PIE.length]} fillOpacity={0.5} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Pengingat</h2><Link to="/reminders" className="text-xs text-primary">Semua</Link></div>
          {d.reminders.length ? (
            <ul className="space-y-3">
              {d.reminders.map((r: any) => (
                <li key={r.type + r.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium">{r.overdue ? <AlertTriangle className="size-3.5 text-expense" /> : null}<span className="truncate">{r.title}</span></p>
                    <p className={`text-xs ${r.overdue ? "text-expense" : "text-muted-foreground"}`}>{r.type === "budget" ? "Peringatan budget" : r.overdue ? `Terlambat ${-r.days_left} hari` : r.days_left === 0 ? "Hari ini" : `${r.days_left} hari lagi · ${dateLabel(r.due_date)}`}</p>
                  </div>
                  <span className="num shrink-0">{money(r.amount, r.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="Tidak ada tagihan 14 hari ke depan." />}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Budget</h2><Link to="/budgets" className="text-xs text-primary">Atur</Link></div>
          {d.budgets.length ? (
            <ul className="space-y-3">
              {d.budgets.map((b: any) => (
                <li key={b.id} className="text-sm">
                  <div className="mb-1 flex justify-between"><span>{b.category}</span><span className={`num ${b.percent >= 100 ? "text-expense" : "text-muted-foreground"}`}>{Math.round(b.percent)}%</span></div>
                  <Progress value={Math.min(100, b.percent)} />
                </li>
              ))}
            </ul>
          ) : <Empty text="Belum ada budget." />}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Saldo akun</h2><Link to="/accounts" className="text-xs text-primary">Kelola</Link></div>
          {d.balances.length ? (
            <ul className="space-y-2 text-sm">
              {d.balances.map((a: any) => (
                <li key={a.id} className="flex justify-between gap-2"><span className="truncate">{a.name}</span><span className="num">{money(a.balance, a.currency)}</span></li>
              ))}
            </ul>
          ) : <Empty text="Tambahkan akun bank / e-wallet." />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Transaksi terbaru</h2><Link to="/transactions" className="text-xs text-primary">Semua</Link></div>
          {d.recent.length ? (
            <ul className="divide-y">
              {d.recent.map((t: any) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.description || t.merchant || t.category?.name || "Transaksi"}</p>
                    <p className="text-xs text-muted-foreground">{dateLabel(t.occurred_at)} · {t.category?.name ?? (t.kind === "transfer" ? "Transfer" : "-")}{t.account?.name ? ` · ${t.account.name}` : ""}</p>
                  </div>
                  <span className={`num shrink-0 font-medium ${t.kind === "income" ? "text-income" : t.kind === "expense" ? "text-expense" : ""}`}>{t.kind === "income" ? "+" : t.kind === "expense" ? "−" : ""}{money(t.amount, t.currency)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="Belum ada transaksi. Mulai catat sekarang!" />}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Target tabungan</h2><Link to="/goals" className="text-xs text-primary">Kelola</Link></div>
          {d.goals.length ? (
            <ul className="space-y-3 text-sm">
              {d.goals.map((g: any) => {
                const p = g.target_amount ? (g.saved_amount / g.target_amount) * 100 : 0;
                return (
                  <li key={g.id}>
                    <div className="mb-1 flex justify-between"><span>{g.name}</span><span className="num text-muted-foreground">{Math.round(p)}%</span></div>
                    <Progress value={Math.min(100, p)} />
                  </li>
                );
              })}
            </ul>
          ) : <Empty text="Belum ada target." />}
        </Card>
      </div>

      <TransactionDialog open={dlg.open} onOpenChange={(o) => setDlg((s) => ({ ...s, open: o }))} initial={dlg.draft} />
    </>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: "income" | "expense"; icon: React.ReactNode }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground"><span className={tone === "income" ? "text-income" : "text-expense"}>{icon}</span>{label}</p>
      <p className={`num mt-2 text-2xl font-semibold ${tone === "income" ? "text-income" : "text-expense"}`}>{money(value)}</p>
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
