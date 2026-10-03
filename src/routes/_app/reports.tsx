import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trendQuery, yearlyQuery } from "@/lib/queries";
import { currentMonth, monthLabel, shortMonth } from "@/lib/dates";
import { compact, money } from "@/lib/format";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_app/reports")({
  head: () => pageHead("Laporan", "Tren pengeluaran per kategori dan rekap tahunan."),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(trendQuery(6, currentMonth())),
    context.queryClient.ensureQueryData(yearlyQuery(Number(currentMonth().slice(0, 4)))),
  ]),
  errorComponent: RouteError,
  component: ReportsPage,
});

const FALLBACK = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--foreground)" };

function ReportsPage() {
  return (
    <>
      <PageHeader title="Laporan" subtitle="Lihat ke mana uang Anda pergi dari bulan ke bulan dan sepanjang tahun." actions={<Button variant="outline" onClick={() => window.print()}>Cetak PDF</Button>} />
      <CategoryTrend />
      <YearlyRecap />
    </>
  );
}

function CategoryTrend() {
  const [months, setMonths] = useState(6);
  const { data } = useQuery({ ...trendQuery(months, currentMonth()), placeholderData: (p) => p });
  const [selected, setSelected] = useState<string[] | null>(null);
  const cats = data?.categories ?? [];
  useEffect(() => { if (selected === null && cats.length) setSelected(cats.slice(0, 5).map((c) => c.id)); }, [cats, selected]);
  const sel = selected ?? [];
  const chart = useMemo(() => (data?.series ?? []).map((r) => ({ ...r, label: shortMonth(String(r["month"])) })), [data]);
  const toggle = (id: string) => setSelected((s) => ((s ?? []).includes(id) ? (s ?? []).filter((x) => x !== id) : [...(s ?? []), id]));

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Tren pengeluaran per kategori</h2>
        <Tabs value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
          <TabsList><TabsTrigger value="6">6 bulan</TabsTrigger><TabsTrigger value="12">12 bulan</TabsTrigger></TabsList>
        </Tabs>
      </div>
      {cats.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pengeluaran pada periode ini.</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {cats.map((c, i) => {
              const on = sel.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${on ? "border-primary bg-primary/10 font-semibold text-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  <span className="size-2.5 rounded-full" style={{ background: c.color ?? FALLBACK[i % FALLBACK.length] }} />
                  {c.name} <span className="num opacity-70">{compact(c.total)}</span>
                </button>
              );
            })}
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} fontSize={12} width={48} />
                <Tooltip formatter={(v: number) => money(v)} contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {cats.map((c, i) => sel.includes(c.id) ? (
                  <Line key={c.id} type="monotone" dataKey={c.id} name={c.name} stroke={c.color ?? FALLBACK[i % FALLBACK.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                ) : null)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function YearlyRecap() {
  const [year, setYear] = useState(Number(currentMonth().slice(0, 4)));
  const { data: y, isFetching } = useQuery({ ...yearlyQuery(year), placeholderData: (p) => p });

  function exportCsv() {
    if (!y) return;
    const lines = [["Bulan", "Pemasukan", "Pengeluaran", "Selisih"], ...y.months.map((m) => [m.month, m.income, m.expense, m.net]), ["Total", y.income, y.expense, y.net]];
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.map((l) => l.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `rekap-${year}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="mt-4 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Rekap tahunan</h2>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setYear(year - 1)} aria-label="Tahun sebelumnya"><ChevronLeft className="size-4" /></Button>
          <span className="num min-w-16 text-center font-semibold">{year}</span>
          <Button size="icon" variant="ghost" onClick={() => setYear(year + 1)} aria-label="Tahun berikutnya"><ChevronRight className="size-4" /></Button>
          <Button size="sm" variant="outline" className="no-print ml-2" onClick={exportCsv}><Download className="size-4" /> CSV</Button>
          {isFetching ? <span className="ml-2 text-xs text-muted-foreground">Memuat…</span> : null}
        </div>
      </div>
      {y ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total pemasukan" value={y.income} className="text-income" />
            <Stat label="Total pengeluaran" value={y.expense} className="text-expense" />
            <Stat label="Selisih" value={y.net} className={y.net >= 0 ? "text-income" : "text-expense"} />
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Rata-rata bulanan</p>
              <p className="num mt-1 text-sm font-semibold text-income">+{money(y.avgIncome)}</p>
              <p className="num text-sm font-semibold text-expense">−{money(y.avgExpense)}</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Bulan</th><th className="px-3 py-2 text-right">Pemasukan</th><th className="px-3 py-2 text-right">Pengeluaran</th><th className="px-3 py-2 text-right">Selisih</th></tr>
              </thead>
              <tbody className="divide-y">
                {y.months.map((m) => (
                  <tr key={m.month}>
                    <td className="px-3 py-2 capitalize">{monthLabel(m.month)}</td>
                    <td className="num px-3 py-2 text-right text-income">{money(m.income)}</td>
                    <td className="num px-3 py-2 text-right text-expense">{money(m.expense)}</td>
                    <td className={`num px-3 py-2 text-right font-semibold ${m.net >= 0 ? "" : "text-expense"}`}>{money(m.net)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/60 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="num px-3 py-2 text-right text-income">{money(y.income)}</td>
                  <td className="num px-3 py-2 text-right text-expense">{money(y.expense)}</td>
                  <td className="num px-3 py-2 text-right">{money(y.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </Card>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`num mt-1 text-xl font-semibold ${className ?? ""}`}>{money(value)}</p>
    </div>
  );
}
