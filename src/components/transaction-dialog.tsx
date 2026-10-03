import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { CURRENCY_OPTIONS, EntityDialog, type FieldDef } from "./entity-dialog";
import { Button } from "@/components/ui/button";
import { errMsg, rowsQuery, invalidateFor } from "@/lib/queries";
import { saveTransaction, uploadReceiptImage } from "@/lib/finance.functions";
import { todayStr } from "@/lib/dates";
import { money } from "@/lib/format";
import { feeOptions } from "@/lib/fees";
import { useI18n } from "@/lib/i18n";
import type { Account, Category } from "@/lib/schemas";

export type TxDraft = Record<string, unknown>;

export function newTxDraft(kind: "income" | "expense" | "transfer" = "expense"): TxDraft {
  return { kind, currency: "IDR", occurred_at: todayStr(), source: "web", items: null };
}

export function TransactionDialog({
  open,
  onOpenChange,
  initial,
  id,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: TxDraft;
  id?: string | null;
}) {
  const { t } = useI18n();
  const accounts = (useQuery(rowsQuery("accounts")).data ?? []) as Account[];
  const categories = (useQuery(rowsQuery("categories")).data ?? []) as Category[];
  const save = useServerFn(saveTransaction);
  const qc = useQueryClient();
  const accOpts = [
    { value: "", label: t("— Tanpa akun —") },
    ...accounts
      .filter((a) => !a.archived)
      .map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` })),
  ];

  const fields = (v: Record<string, unknown>): FieldDef[] => [
    {
      name: "kind",
      label: t("Jenis"),
      type: "select",
      half: true,
      options: [
        { value: "expense", label: t("Pengeluaran") },
        { value: "income", label: t("Pemasukan") },
        { value: "transfer", label: t("Transfer antar akun") },
      ],
    },
    { name: "occurred_at", label: t("Tanggal"), type: "date", half: true },
    { name: "amount", label: t("Jumlah"), type: "number", half: true, placeholder: "50000" },
    {
      name: "currency",
      label: t("Mata uang"),
      type: "select",
      half: true,
      options: CURRENCY_OPTIONS,
    },
    {
      name: "account_id",
      label: v["kind"] === "transfer" ? t("Dari akun") : t("Akun / dompet"),
      type: "select",
      half: true,
      options: accOpts,
    },
    v["kind"] === "transfer"
      ? { name: "to_account_id", label: t("Ke akun"), type: "select", half: true, options: accOpts }
      : {
          name: "category_id",
          label: t("Kategori"),
          type: "select",
          half: true,
          options: [
            { value: "", label: t("— Tanpa kategori —") },
            ...categories
              .filter((c) => c.kind === v["kind"])
              .map((c) => ({ value: c.id, label: c.name })),
          ],
        },
    ...(!id && v["kind"] !== "income"
      ? [
          {
            name: "fee",
            label:
              v["kind"] === "transfer"
                ? t("Biaya transfer / admin (opsional)")
                : t("Biaya admin (opsional)"),
            type: "number" as const,
            half: true,
            placeholder: "2500",
          },
        ]
      : []),
    {
      name: "description",
      label: t("Deskripsi"),
      type: "text",
      placeholder: "Makan siang, gaji Oktober…",
    },
    { name: "merchant", label: t("Merchant / sumber"), type: "text", half: true },
    { name: "notes", label: t("Catatan"), type: "text", half: true },
  ];

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={id ? t("Ubah transaksi") : t("Catat transaksi")}
      fields={fields}
      initial={initial}
      onSubmit={async (v) => {
        await save({ data: { id: id ?? null, values: v as never } });
        await invalidateFor(qc, "transactions");
      }}
      extra={(v, set) => (
        <div className="space-y-3">
          {!id && v["kind"] === "transfer"
            ? (() => {
                const opts = feeOptions(
                  accounts.find((a) => a.id === v["account_id"]) as never,
                  accounts.find((a) => a.id === v["to_account_id"]) as never,
                );
                return opts.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="w-full text-xs text-muted-foreground">
                      {t("Preset biaya:")}
                    </span>
                    {opts.map((o, i) => (
                      <Button
                        key={i}
                        type="button"
                        size="sm"
                        variant={Number(v["fee"]) === o.amount ? "secondary" : "outline"}
                        onClick={() => set("fee", o.amount)}
                        className="h-8 max-w-full rounded-full px-2.5 text-xs"
                      >
                        {o.label} · {money(o.amount, String(v["currency"] ?? "IDR"))}
                      </Button>
                    ))}
                    {Number(v["fee"]) > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => set("fee", "")}
                        className="h-7 rounded-full px-2.5 text-xs text-muted-foreground"
                      >
                        {t("Tanpa biaya")}
                      </Button>
                    ) : null}
                  </div>
                ) : null;
              })()
            : null}
          {(v["items"] as { name: string; qty?: number | null; price?: number | null }[] | null)
            ?.length ? (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              <p className="mb-2 font-medium">{t("Rincian item dari nota")}</p>
              <ul className="space-y-1">
                {(v["items"] as { name: string; qty?: number | null; price?: number | null }[]).map(
                  (it, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {it.qty ? `${it.qty}× ` : ""}
                        {it.name}
                      </span>
                      <span className="num shrink-0 text-muted-foreground">
                        {it.price != null ? money(it.price, String(v["currency"] ?? "IDR")) : ""}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}
          <ReceiptField
            path={(v["receipt_path"] as string | null) ?? null}
            onChange={(p) => set("receipt_path", p)}
          />
        </div>
      )}
    />
  );
}

function ReceiptField({
  path,
  onChange,
}: {
  path: string | null;
  onChange: (p: string | null) => void;
}) {
  const { t } = useI18n();
  const upload = useServerFn(uploadReceiptImage);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      toast.error(t("Gambar maksimal 5 MB"));
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error(t("Gagal membaca file")));
        r.readAsDataURL(file);
      });
      const { path } = await upload({ data: { image: dataUrl } });
      onChange(path);
      toast.success(t("Foto nota terlampir"));
    } catch (err) {
      toast.error(t("Gagal mengunggah nota"), { description: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-muted/50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium">
          <Paperclip className="size-3.5" /> {t("Foto nota")}
        </p>
        <div className="flex items-center gap-2">
          {path ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-expense"
              onClick={() => onChange(null)}
            >
              {t("Hapus")}
            </Button>
          ) : null}
          <label className="cursor-pointer py-1.5 text-xs text-primary hover:underline">
            {busy ? t("Mengunggah…") : path ? t("Ganti") : t("Unggah")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={pick}
            />
          </label>
        </div>
      </div>
      {path ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {t("Terlampir — akan tersimpan bersama transaksi.")}
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("Opsional. JPEG/PNG/WebP, maks 5 MB.")}
        </p>
      )}
    </div>
  );
}
