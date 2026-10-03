import { draftSchema, type Draft } from "./schemas";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function aiJson(messages: unknown[]): Promise<unknown> {
  const url = process.env["AI_API_URL"] || "https://ai.gateway.lovable.dev/v1/chat/completions";
  const key = process.env["AI_API_KEY"] || process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI_API_KEY belum diatur untuk fitur OCR.");
  const model = process.env["AI_MODEL"] || "google/gemini-2.5-flash";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, response_format: { type: "json_object" } }),
  });
  if (!res.ok) {
    console.error(`AI request failed [${res.status}]: ${await res.text()}`);
    if (res.status === 429) throw new Error("Batas pemakaian AI tercapai, coba lagi sebentar.");
    if (res.status === 402) throw new Error("Kredit AI habis.");
    throw new Error(`Gagal membaca dengan AI [${res.status}].`);
  }
  const j: any = await res.json();
  const content: string = j?.choices?.[0]?.message?.content ?? "{}";
  const m = content.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : content);
}

const SHAPE = `Balas HANYA JSON: {"kind":"expense"|"income","amount":number,"currency":"IDR"|"USD","merchant":string|null,"date":"YYYY-MM-DD"|null,"category":string|null,"description":string|null,"items":[{"name":string,"qty":number|null,"price":number|null}]}. amount = total akhir yang dibayar (angka murni, tanpa titik ribuan). Pilih category dari daftar jika cocok.`;

export async function parseReceipt(imageDataUrl: string, categories: string[]): Promise<Draft> {
  const out = await aiJson([
    { role: "system", content: `Kamu membaca foto nota/struk belanja Indonesia. ${SHAPE} Kategori: ${categories.join(", ")}` },
    { role: "user", content: [{ type: "text", text: "Ekstrak data transaksi dari nota ini." }, { type: "image_url", image_url: { url: imageDataUrl } }] },
  ]);
  return draftSchema.parse(out);
}

export async function parseText(text: string, categories: string[], today: string): Promise<Draft> {
  const out = await aiJson([
    { role: "system", content: `Kamu mengubah pesan chat singkat (Bahasa Indonesia, contoh "makan siang 25rb", "gaji masuk 8jt", "netflix $15") jadi transaksi. "rb"/"k"=ribu, "jt"=juta. Hari ini ${today}. ${SHAPE} Kategori: ${categories.join(", ")}` },
    { role: "user", content: text },
  ]);
  return draftSchema.parse(out);
}
