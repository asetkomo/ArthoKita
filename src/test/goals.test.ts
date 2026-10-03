import { describe, expect, it } from "vitest";
import { activityDetail } from "../lib/activity";
import { goalMarker, goalTransferDescription, planGoalFunds } from "../lib/goals";

const base = {
  goalId: "g1",
  goalName: "Dana darurat",
  goalAccountId: "save",
  saved: 1_000_000,
  amount: 500_000,
  accountId: "bca",
  date: "2026-10-04",
};

describe("planGoalFunds", () => {
  it("deposit transfers source -> goal account and bumps saved", () => {
    const p = planGoalFunds(base);
    expect(p).toMatchObject({ direction: "deposit", moved: 500_000, newSaved: 1_500_000 });
    expect(p.transfer).toEqual({
      account_id: "bca",
      to_account_id: "save",
      amount: 500_000,
      description: "Setor target Dana darurat",
      notes: "[goal:g1]",
      occurred_at: "2026-10-04",
    });
  });
  it("withdrawal transfers goal account -> chosen account, capped at saved", () => {
    const p = planGoalFunds({ ...base, amount: -3_000_000 });
    expect(p).toMatchObject({ direction: "withdraw", moved: 1_000_000, newSaved: 0 });
    expect(p.transfer).toMatchObject({
      account_id: "save",
      to_account_id: "bca",
      amount: 1_000_000,
      description: "Tarik target Dana darurat",
    });
  });
  it("no transfer without both accounts or when they are the same", () => {
    expect(planGoalFunds({ ...base, goalAccountId: null }).transfer).toBeNull();
    expect(planGoalFunds({ ...base, accountId: null }).transfer).toBeNull();
    expect(planGoalFunds({ ...base, accountId: "save" }).transfer).toBeNull();
    expect(planGoalFunds({ ...base, accountId: null }).newSaved).toBe(1_500_000);
  });
  it("rejects zero, non-finite and withdrawing from an empty goal", () => {
    expect(() => planGoalFunds({ ...base, amount: 0 })).toThrow();
    expect(() => planGoalFunds({ ...base, amount: Number.NaN })).toThrow();
    expect(() => planGoalFunds({ ...base, saved: 0, amount: -10 })).toThrow();
  });
  it("helpers", () => {
    expect(goalMarker("x")).toBe("[goal:x]");
    expect(goalTransferDescription("withdraw", "Liburan")).toBe("Tarik target Liburan");
  });
  it("activity detail shows the transfer route", () => {
    expect(
      activityDetail(
        { name: "Liburan", amount: 5, currency: "IDR", from: "BCA", to: "Jago" },
        (n) => String(n),
      ),
    ).toBe("Liburan · 5 · BCA → Jago");
  });
});
