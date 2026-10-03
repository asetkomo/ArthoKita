import { db } from "./db.server";

const BUCKET = "receipts";

export async function uploadReceipt(dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new Error("Format foto tidak didukung (JPG/PNG/WEBP).");
  const bytes = Buffer.from(m[3]!, "base64");
  if (bytes.length > 5 * 1024 * 1024) throw new Error("Foto maksimal 5 MB.");
  const ext = m[2] === "jpeg" ? "jpg" : m[2];
  const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: m[1]!, upsert: false });
  if (error) throw new Error(`Gagal mengunggah foto: ${error.message}. Pastikan bucket 'receipts' sudah dibuat.`);
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 600);
  if (error || !data) throw new Error(error?.message ?? "Foto tidak ditemukan");
  return data.signedUrl;
}

export async function removeReceipt(path: string | null | undefined) {
  if (!path) return;
  const { error } = await db().storage.from(BUCKET).remove([path]);
  if (error) console.error("remove receipt failed", error.message);
}
