import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RouteError } from "@/components/route-error";
import { RowActions, useCrudDialog } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fxQuery, rowsQuery } from "@/lib/queries";
import { money } from "@/lib/format";
import { pageHead } from "@/lib/head";
import type { Category } from "@/lib/schemas";

export const Route = createFileRoute("/_app/settings")({
  head: () => pageHead("Pengaturan", "Kategori, kurs, dan integrasi bot n8n."),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(rowsQuery("categories")), context.queryClient.ensureQueryData(fxQuery())]),
  errorComponent: RouteError,
  component: SettingsPage,
});

const ENDPOINTS = [
  { method: "POST", path: "/api/public/n8n/message", desc: "Teks bebas dari bot → dicatat otomatis", body: `{ "text": "makan siang 25rb", "source": "telegram", "account": "GoPay" }` },
  { method: "POST", path: "/api/public/n8n/ocr", desc: "Foto nota (base64) → dibaca AI & dicatat", body: `{ "image_base64": "...", "mime_type": "image/jpeg", "source": "telegram" }` },
  { method: "POST", path: "/api/public/n8n/transactions", desc: "Data transaksi terstruktur (satu atau array)", body: `{ "kind": "expense", "amount": 25000, "category": "Makanan & Minuman", "account": "GoPay", "description": "Kopi" }` },
  { method: "GET", path: "/api/public/n8n/reminders?days=7", desc: "Daftar tagihan + teks siap kirim (jadwalkan harian di n8n)", body: "" },
  { method: "GET", path: "/api/public/n8n/summary?month=2026-10", desc: "Ringkasan bulanan + teks laporan", body: "" },
];

function SettingsPage() {
  const categories = useSuspenseQuery(rowsQuery("categories")).data as Category[];
  const { usdIdr } = useSuspenseQuery(fxQuery()).data;
  const crud = useCrudDialog("categories", { kind: "expense", color: "#d0703c" });
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <>
      <PageHeader title="Pengaturan" />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["expense", "income"] as const).map((kind) => (
          <Card key={kind} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Kategori {kind === "expense" ? "pengeluaran" : "pemasukan"}</h2>
              <Button size="sm" variant="outline" onClick={() => crud.openNew({ kind })}><Plus className="size-4" /> Tambah</Button>
            </div>
            <ul className="divide-y">
              {categories.filter((c) => c.kind === kind).map((c) => (
                <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: c.color ?? "var(--muted-foreground)" }} />{c.name}</span>
                  <RowActions onEdit={() => crud.openEdit({ ...c })} onDelete={() => crud.remove(c.id, `kategori ${c.name}`)} />
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <h2 className="text-lg font-semibold">Kurs</h2>
        <p className="mt-1 text-sm text-muted-foreground">Diperbarui otomatis sekali sehari. Saat ini <span className="num font-semibold text-foreground">1 USD = {money(usdIdr)}</span>.</p>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="text-lg font-semibold">Integrasi n8n (Telegram / WhatsApp / Email)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Kirim header <code className="rounded bg-muted px-1">x-api-key: &lt;N8N_API_KEY&gt;</code> di setiap request. Semua respons berisi field <code className="rounded bg-muted px-1">message</code> yang bisa langsung dibalas ke chat.</p>
        <ul className="mt-4 space-y-3">
          {ENDPOINTS.map((e) => (
            <li key={e.path} className="rounded-xl border p-3">
              <p className="text-sm"><span className="mr-2 rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-ink-foreground">{e.method}</span><code className="num break-all text-xs">{origin}{e.path}</code></p>
              <p className="mt-1 text-xs text-muted-foreground">{e.desc}</p>
              {e.body ? <pre className="num mt-2 overflow-x-auto rounded-lg bg-muted p-2 text-xs">{e.body}</pre> : null}
            </li>
          ))}
        </ul>
      </Card>
      {crud.dialog("kategori", [
        { name: "name", label: "Nama", type: "text" },
        { name: "kind", label: "Jenis", type: "select", half: true, options: [{ value: "expense", label: "Pengeluaran" }, { value: "income", label: "Pemasukan" }] },
        { name: "color", label: "Warna", type: "color", half: true },
      ])}
    </>
  );
}
