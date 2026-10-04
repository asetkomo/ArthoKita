/** Pure, client-safe helpers for multiple receipt photos per transaction (schema v12). */

export const MAX_RECEIPTS = 5;

type WithPaths = {
  receipt_path?: string | null | undefined;
  receipt_paths?: string[] | null | undefined;
};

/** All photo paths of a row: receipt_paths when set, else the legacy single receipt_path. */
export function receiptPaths(row: WithPaths | null | undefined): string[] {
  if (!row) return [];
  const list = (row.receipt_paths ?? []).filter((p): p is string => !!p);
  const all =
    row.receipt_path && !list.includes(row.receipt_path) ? [row.receipt_path, ...list] : list;
  return [...new Set(all)].slice(0, MAX_RECEIPTS);
}

/** Columns to save for a list of paths: receipt_path is always the first (backward compatible). */
export function receiptColumns(paths: string[]): {
  receipt_path: string | null;
  receipt_paths: string[] | null;
} {
  const list = [...new Set(paths.filter(Boolean))].slice(0, MAX_RECEIPTS);
  return { receipt_path: list[0] ?? null, receipt_paths: list.length ? list : null };
}
