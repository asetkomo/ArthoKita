import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";
import { transactionSchema } from "./schemas";

const splitRowSchema = z.object({
  category_id: z.string().uuid(),
  amount: z.coerce.number().finite().positive(),
  note: z.string().trim().max(200).nullable().optional(),
});

export const saveSplitTransaction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        values: transactionSchema.extend({
          receipt_paths: z.array(z.string().min(1).max(500)).max(5).nullable().optional(),
        }),
        rows: z.array(splitRowSchema).min(2).max(20),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { saveSplitTransaction } = await import("./split.server");
    const res = await saveSplitTransaction(data.values, data.rows);
    return { group: res.group, count: res.transactions.length };
  });

/** Deletes a transaction; `wholeGroup` also deletes its split siblings. Photos are removed. */
export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), wholeGroup: z.boolean().default(false) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { deleteTransactionRows } = await import("./split.server");
    return deleteTransactionRows(data.id, data.wholeGroup);
  });
