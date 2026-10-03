import { describe, expect, it } from "vitest";
import { fetchAll } from "@/lib/paginate";

/** Fake PostgREST: serves `total` rows but never more than `maxRows` per response. */
function fakeTable(total: number, maxRows = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return Promise.resolve({ data: rows.slice(from, end), error: null });
  };
  return { build, calls };
}

describe("fetchAll (PostgREST paging)", () => {
  it("returns everything past the 1000-row cap", async () => {
    const t = fakeTable(2500);
    const res = await fetchAll<{ id: number }>(t.build);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2500);
    expect(res.data!.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("stops after a single short page", async () => {
    const t = fakeTable(7);
    const res = await fetchAll(t.build);
    expect(res.data).toHaveLength(7);
    expect(t.calls).toEqual([[0, 999]]);
  });

  it("asks one more page when the last page was exactly full", async () => {
    const t = fakeTable(2000);
    const res = await fetchAll(t.build);
    expect(res.data).toHaveLength(2000);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("handles an empty result", async () => {
    const t = fakeTable(0);
    expect((await fetchAll(t.build)).data).toEqual([]);
    expect(t.calls).toHaveLength(1);
  });

  it("respects the hard cap and a custom page size", async () => {
    const t = fakeTable(100, 1000);
    const res = await fetchAll(t.build, { pageSize: 10, hardCap: 25 });
    expect(res.data).toHaveLength(25);
    expect(t.calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 24],
    ]);
  });

  it("treats a server cap smaller than the page size as a short page", async () => {
    const t = fakeTable(50, 20);
    const res = await fetchAll(t.build, { pageSize: 100 });
    expect(res.data).toHaveLength(20);
    expect(t.calls).toEqual([[0, 99]]);
  });

  it("returns the first error and stops paging", async () => {
    const calls: number[] = [];
    const build = (from: number, to: number) => {
      calls.push(from);
      if (from === 0)
        return Promise.resolve({
          data: Array.from({ length: to - from + 1 }, (_, i) => i),
          error: null,
        });
      return Promise.resolve({ data: null, error: { message: "boom" } });
    };
    const res = await fetchAll(build, { pageSize: 5 });
    expect(res).toEqual({ data: null, error: { message: "boom" } });
    expect(calls).toEqual([0, 5]);
  });

  it("works with lazy thenables like Supabase query builders", async () => {
    const thenable = (data: unknown[]) =>
      ({
        then: (ok: (v: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve(ok({ data, error: null })),
      }) as unknown as PromiseLike<{ data: unknown[]; error: null }>;
    const res = await fetchAll((from) => thenable(from === 0 ? [1, 2] : []), { pageSize: 2 });
    expect(res.data).toEqual([1, 2]);
  });
});
