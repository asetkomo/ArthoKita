/** Pure, client-safe gold & receivable math (unit-tested). */
export const TROY_OUNCE_GRAMS = 31.1034768;

export type GoldPrice = { source: "world" | "antam"; date: string; buy: number; buyback: number; estimated: boolean };
export type GoldTx = { kind: "buy" | "sell"; grams: number; price_per_gram: number; total: number };

/** Average-cost method: sells reduce grams and cost basis at the running average price. */
export function goldHoldings(rows: GoldTx[]) {
  let grams = 0;
  let cost = 0;
  let realized = 0;
  const chrono = [...rows].reverse();
  for (const r of chrono) {
    if (r.kind === "buy") {
      grams += r.grams;
      cost += r.total;
    } else {
      const avg = grams > 0 ? cost / grams : 0;
      const g = Math.min(r.grams, grams);
      cost -= avg * g;
      grams -= g;
      realized += r.total - avg * g;
    }
  }
  return { grams: round(grams, 4), cost: Math.round(cost), avgPrice: grams > 0 ? Math.round(cost / grams) : 0, realized: Math.round(realized) };
}

export function goldValue(grams: number, price: GoldPrice | null, cost: number) {
  if (!price) return null;
  const value = Math.round(grams * price.buyback);
  return { value, pnl: value - cost, pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0 };
}

export function receivableStatus(amount: number, payments: { amount: number }[]) {
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  return { paid, remaining: Math.max(0, amount - paid), progress: amount > 0 ? Math.min(100, (paid / amount) * 100) : 0 };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
