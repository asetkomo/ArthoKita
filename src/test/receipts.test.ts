import { describe, expect, it } from "vitest";
import { MAX_RECEIPTS, receiptColumns, receiptPaths } from "../lib/receipts";

describe("receiptPaths", () => {
  it("falls back to legacy receipt_path", () => {
    expect(receiptPaths({ receipt_path: "a.jpg" })).toEqual(["a.jpg"]);
    expect(receiptPaths({ receipt_path: null, receipt_paths: null })).toEqual([]);
    expect(receiptPaths(null)).toEqual([]);
  });
  it("merges, dedupes and caps", () => {
    expect(receiptPaths({ receipt_path: "a", receipt_paths: ["a", "b"] })).toEqual(["a", "b"]);
    expect(receiptPaths({ receipt_path: "z", receipt_paths: ["a"] })).toEqual(["z", "a"]);
    const many = Array.from({ length: 8 }, (_, i) => `p${i}`);
    expect(receiptPaths({ receipt_paths: many })).toHaveLength(MAX_RECEIPTS);
  });
});

describe("receiptColumns", () => {
  it("keeps receipt_path as the first photo", () => {
    expect(receiptColumns(["a", "b", "a"])).toEqual({
      receipt_path: "a",
      receipt_paths: ["a", "b"],
    });
    expect(receiptColumns([])).toEqual({ receipt_path: null, receipt_paths: null });
  });
});
