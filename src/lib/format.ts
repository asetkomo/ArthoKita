export function money(v: number | string | null | undefined, cur: string = "IDR"): string {
  const n = Number(v ?? 0) || 0;
  return new Intl.NumberFormat(cur === "USD" ? "en-US" : "id-ID", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: cur === "USD" ? 2 : 0,
  }).format(n);
}

export function compact(v: number): string {
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export const KIND_LABEL: Record<string, string> = {
  income: "Pemasukan",
  expense: "Pengeluaran",
  transfer: "Transfer",
};
