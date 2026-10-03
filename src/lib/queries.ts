import { queryOptions, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deleteRow, getBalances, getBudgets, getDashboard, getDebts, getFxRate, getReminders, getYearly, getCategoryTrend, getYearlySummary, listRows, listTransactions, saveRow } from "./finance.functions";
import type { CrudTable } from "./schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const rowsQuery = (table: CrudTable) => queryOptions({ queryKey: ["rows", table], queryFn: () => listRows({ data: { table } }) });
export const dashboardQuery = (month: string) => queryOptions({ queryKey: ["dashboard", month], queryFn: () => getDashboard({ data: { month } }) });
export const remindersQuery = (days: number) => queryOptions({ queryKey: ["reminders", days], queryFn: () => getReminders({ data: { days } }) });
export const debtsQuery = () => queryOptions({ queryKey: ["debts"], queryFn: () => getDebts() });
export const budgetsQuery = (month: string) => queryOptions({ queryKey: ["budgets", month], queryFn: () => getBudgets({ data: { month } }) });
export const balancesQuery = () => queryOptions({ queryKey: ["balances"], queryFn: () => getBalances() });
export const fxQuery = () => queryOptions({ queryKey: ["fx"], queryFn: () => getFxRate(), staleTime: 3600_000 });
export const trendQuery = (months: number, end: string) => queryOptions({ queryKey: ["trend", months, end], queryFn: () => getCategoryTrend({ data: { months, end } }) });
export const yearlySummaryQuery = (year: number) => queryOptions({ queryKey: ["yearly-summary", year], queryFn: () => getYearlySummary({ data: { year } }) });
export type TxFilter = { month?: string; kind?: "income" | "expense" | "transfer"; search?: string };
export const txQuery = (f: TxFilter) => queryOptions({ queryKey: ["tx", f], queryFn: () => listTransactions({ data: f }) });
export const yearlyQuery = (year: string) => queryOptions({ queryKey: ["yearly", year], queryFn: () => getYearly({ data: { year } }) });

export function useCrud(table: CrudTable) {
  const qc = useQueryClient();
  const save = useServerFn(saveRow);
  const del = useServerFn(deleteRow);
  return {
    save: async (values: Record<string, unknown>, id?: string | null) => {
      await save({ data: { table, id: id ?? null, values } });
      await qc.invalidateQueries();
    },
    remove: async (id: string) => {
      await del({ data: { table, id } });
      await qc.invalidateQueries();
    },
  };
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(m) as any[];
    if (Array.isArray(parsed)) return parsed.map((x) => `${(x.path ?? []).join(".")}: ${x.message}`).join(", ");
  } catch {
    /* not json */
  }
  return m;
}
