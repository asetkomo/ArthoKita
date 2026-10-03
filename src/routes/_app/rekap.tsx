import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { Empty } from "./dashboard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { yearlyQuery } from "@/lib/queries";
import { currentMonth, shortMonth } from "@/lib/dates";
import { compact, money } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { pageHead } from "@/lib/head";


/* eslint-disable @typescript-eslint/no-explicit-any */
export const Route = createFileRoute("/_app/rekap")({
  head: () => pageHead("Rekap Tahunan", "Total pemasukan, pengeluaran, dan rata-rata bulanan sepanjang tahun."),
  loader: ({ context }) => context.queryClient.ensureQueryData(yearlyQuery(currentMonth().slice(0, 4))),
  errorComponent: RouteError,
  component: RekapPage,
});

const PIE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function RekapPage() {
  const [year, setYear] = useState(currentMonth().slice(0, 4));
  const { data: d } = useQuery({ ...yearlyQuery(year), placeholderData: (p) => p });
  if (!d) return null;

  return (
    <>
      <PageHeader title="Rekap Tahunan" subtitle="Gambaran besar keuangan Anda selama setahun penuh." />

      <div className="mb-5 flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setYear(String(Number(year) - 1))} aria-label="Tahun sebelumnya"><ChevronLeft className="size-4" /></Button>
        <p className="min-w-24 text-center font-display text-lg font-semibold">{year}</p>
        <Button size="icon" variant="ghost" onClick={() => setYear(String(Number(year) + 1))} aria-label="Tahun berikutnya"><ChevronRight className="size-4" /></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total pemasukan</p>
          <p className="num mt-2 text-2xl font-semibold text-income">{money(d.income)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rata-rata {money(d.avgIncome)}/bln</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total pengeluaran</p>
          <p className="num mt-2 text-2xl font-semibold text-expense">{money(d.expense)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Rata-rata {money(d.avgExpense)}/bln</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Selisih setahun</p>
          <p className={`num mt-2 text-2xl font-semibold ${d.net >= 0 ? "text-income" : "text-expense"}`}>{money(d.net)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{d.net >= 0 ? "Surplus" : "Defisit"} {money(Math.abs(d.net / 12))}/bln</p>
        </Card>
        <Card className="bg-ink p-5 text-ink-foreground">
          <p className="text-xs uppercase tracking-wider text-ink-muted">Rasio menabung</p>
          <p className="num mt-2 text-2xl font-semibold">{d.income > 0 ? `${Math.round((d.net / d.income) * 100)}%` : "—"}</p>
          <p className="mt-1 text-xs text-ink-muted">dari total pemasukan</p>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-4 text-lg font-semibold">Arus kas per bulan</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.months.map((m: any) => ({ ...m, label: shortMonth(m.month) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
              <Tooltip formatter={(v: number) => money(v)} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="income" name="Pemasukan" fill="var(--income)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Pengeluaran" fill="var(--expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-2 text-lg font-semibold">Pengeluaran per kategori (setahun)</h2>
          {d.byCategory.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={d.byCategory.slice(0, 8)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                    {d.byCategory.slice(0, 8).map((c: any, i: number) => <Cell key={i} fill={c.color ?? PIE[i % PIE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty text="Belum ada pengeluaran tahun ini." />}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">Kategori terbesar</h2>
          {d.byCategory.length ? (
            <ul className="space-y-2 text-sm">
              {d.byCategory.slice(0, 10).map((c: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 truncate">
                    <span className="num w-5 text-muted-foreground">{i + 1}.</span>
                    <span className="size-2.5 rounded-full" style={{ background: c.color ?? PIE[i % PIE.length] }} />
                    {c.name}
                  </span>
                  <span className="num text-muted-foreground">{money(c.value)}</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="Belum ada data." />}
        </Card>
      </div>
    </>
  );
}
