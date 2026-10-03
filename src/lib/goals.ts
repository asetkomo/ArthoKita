/** Pure savings-goal helpers (client-safe, unit-tested). */

export type GoalFundsInput = {
  goalId: string;
  goalName: string;
  /** Savings/destination account linked to the goal (optional). */
  goalAccountId: string | null;
  saved: number;
  /** Positive = deposit, negative = withdrawal. */
  amount: number;
  /** Source account for a deposit, destination account for a withdrawal. */
  accountId: string | null;
  date: string;
};

export type GoalTransfer = {
  account_id: string;
  to_account_id: string;
  amount: number;
  description: string;
  notes: string;
  occurred_at: string;
};

export type GoalFundsPlan = {
  direction: "deposit" | "withdraw";
  /** Amount actually moved (withdrawals are capped at what is saved). */
  moved: number;
  newSaved: number;
  transfer: GoalTransfer | null;
};

export const goalMarker = (goalId: string) => `[goal:${goalId}]`;

export function goalTransferDescription(direction: "deposit" | "withdraw", name: string): string {
  return `${direction === "deposit" ? "Setor target" : "Tarik target"} ${name}`.trim();
}

/** Decide how a deposit/withdrawal on a goal moves money. Never produces an expense. */
export function planGoalFunds(i: GoalFundsInput): GoalFundsPlan {
  if (!Number.isFinite(i.amount) || i.amount === 0) throw new Error("Nominal harus diisi");
  const saved = Math.max(0, Number(i.saved) || 0);
  const direction = i.amount > 0 ? "deposit" : "withdraw";
  const moved = direction === "deposit" ? i.amount : Math.min(-i.amount, saved);
  if (moved <= 0) throw new Error("Dana target masih kosong");
  const newSaved = direction === "deposit" ? saved + moved : saved - moved;
  let transfer: GoalTransfer | null = null;
  if (i.goalAccountId && i.accountId && i.goalAccountId !== i.accountId) {
    const [from, to] = direction === "deposit" ? [i.accountId, i.goalAccountId] : [i.goalAccountId, i.accountId];
    transfer = { account_id: from, to_account_id: to, amount: moved, description: goalTransferDescription(direction, i.goalName), notes: goalMarker(i.goalId), occurred_at: i.date };
  }
  return { direction, moved, newSaved, transfer };
}
