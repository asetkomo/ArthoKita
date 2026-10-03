/**
 * PostgREST (Supabase) caps every response at `max-rows` (1000 by default) no matter what `.limit()`
 * asks for. `fetchAll` pages through a query with `.range()` until a short page comes back or the
 * hard cap is reached. Pages are fetched sequentially and only while the previous page was full.
 *
 * The builder MUST apply a stable, total order (add an `.order("id")` tie-breaker) so rows never
 * shift between pages. Pure and client-safe: it only needs a thenable returning `{ data, error }`.
 */
export const PAGE_SIZE = 1000;
export const DEFAULT_HARD_CAP = 100_000;

export type PageResult<E> = { data: unknown; error: E | null };
export type FetchAllOptions = { pageSize?: number; hardCap?: number };

export async function fetchAll<T = any, E = { message: string }>( // eslint-disable-line @typescript-eslint/no-explicit-any
  build: (from: number, to: number) => PromiseLike<PageResult<E>>,
  options: FetchAllOptions = {},
): Promise<{ data: T[] | null; error: E | null }> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? PAGE_SIZE));
  const hardCap = Math.max(0, Math.floor(options.hardCap ?? DEFAULT_HARD_CAP));
  const rows: T[] = [];
  for (let from = 0; from < hardCap; from += pageSize) {
    const to = Math.min(from + pageSize, hardCap) - 1;
    const res = await build(from, to);
    if (res.error) return { data: null, error: res.error };
    const batch = (Array.isArray(res.data) ? res.data : []) as T[];
    for (const row of batch) rows.push(row);
    if (batch.length < to - from + 1) break;
  }
  return { data: rows, error: null };
}
