# Dompetku — Setup

## 1. Supabase
1. Buat project di supabase.com.
2. Buka **SQL Editor**, tempel isi `supabase/schema.sql`, lalu Run.
3. Ambil **Project URL** dan **service_role / secret key** (Project Settings → API).

## 2. Environment variables (Vercel → Settings → Environment Variables)
| Nama | Isi |
|---|---|
| `SUPABASE_URL` | https://xxxx.supabase.co |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / sb_secret_… (hanya di server) |
| `APP_USERNAME` | username login |
| `APP_PASSWORD` | password login (panjang & unik) |
| `SESSION_SECRET` | string acak ≥ 32 karakter (`openssl rand -hex 32`) |
| `N8N_API_KEY` | string acak ≥ 24 karakter, dipakai n8n di header `x-api-key` |
| `AI_API_KEY` | API key untuk OCR / parsing chat (OpenAI-compatible) |
| `AI_API_URL` | opsional, default Lovable AI gateway. Contoh OpenAI: `https://api.openai.com/v1/chat/completions` |
| `AI_MODEL` | opsional, mis. `gpt-4o-mini` atau `google/gemini-2.5-flash` |
| `APP_TIMEZONE` | opsional, default `Asia/Jakarta` |
| `FALLBACK_USD_IDR` | opsional, kurs cadangan bila API kurs gagal |
| `RESEND_API_KEY` | opsional, untuk kirim email pengingat langsung (resend.com) |
| `EMAIL_FROM` | opsional, pengirim terverifikasi di Resend, mis. `Dompetku <pengingat@domainanda.com>` |
| `EMAIL_TO` | opsional, penerima (pisahkan koma untuk beberapa) |

## 3. Deploy ke Vercel
Import repo → Framework preset **Other** → Build command `bun run build` (atau `npm run build`).
Konfigurasi otomatis memakai target Vercel saat build berjalan di Vercel.

## 4. Endpoint n8n
Semua endpoint wajib header `x-api-key: <N8N_API_KEY>`. Setiap respons punya field `message` untuk dibalas ke chat.

| Method | Path | Kegunaan |
|---|---|---|
| POST | `/api/public/n8n/message` | `{ "text": "kopi 25rb", "source": "telegram", "account": "GoPay" }` → AI parsing & simpan |
| POST | `/api/public/n8n/ocr` | `{ "image_base64": "...", "mime_type": "image/jpeg", "source": "telegram" }` → OCR nota & simpan (`save:false` untuk preview) |
| POST | `/api/public/n8n/transactions` | data terstruktur (objek atau array). Kategori & akun dicocokkan berdasarkan nama |
| GET | `/api/public/n8n/reminders?days=7` | daftar tagihan + teks pengingat |
| GET | `/api/public/n8n/reminders-email?days=7` | pengingat siap-email: `subject`, `text`, `html`, `count` |
| POST | `/api/public/n8n/reminders-send-email` | `{ "days": 7, "to": "opsional@email.com" }` → kirim langsung via Resend (butuh env Resend) |
| GET | `/api/public/n8n/summary?month=YYYY-MM` | laporan bulanan |
| POST | `/api/public/n8n/command` | `{ "text": "saldo" / "summary" / "reminders" / "pay <nama>" / "help" }` → aksi bot langsung, jawaban siap kirim |

### Contoh alur n8n
- **Bot Telegram/WhatsApp**: Trigger pesan → jika ada foto: download file → base64 → POST `/ocr`; jika teks: POST `/message` → balas `{{$json.message}}`.
- **Perintah bot langsung**: Trigger pesan → POST `/command` dengan `{ "text": "<pesan>" }` → balas `{{$json.message}}`. Kata kunci: `saldo` (saldo semua akun), `summary` (ringkasan bulan ini), `reminders` (tagihan yang jatuh tempo), `pay <nama cicilan>` (catat cicilan terbayar), `help`.
- **Pengingat harian**: Schedule (08:00) → GET `/reminders?days=3` → jika `count > 0` kirim `message` ke Telegram/WhatsApp/Email.
- **Pengingat via email (node Email n8n)**: Schedule (08:00) → HTTP GET `/reminders-email?days=3` → IF `{{$json.count}} > 0` → node *Send Email* / *Gmail*: Subject `{{$json.subject}}`, HTML `{{$json.html}}`, Text `{{$json.text}}`.
- **Pengingat via email tanpa node email**: Schedule → HTTP POST `/reminders-send-email` (`{"days":3}`); otomatis dilewati bila tidak ada pengingat.
- **Laporan bulanan**: Schedule tanggal 1 → GET `/summary?month=<bulan lalu>` → kirim.


## 5. Pembaruan v2 (jalankan sekali)
Jalankan ulang bagian paling bawah `supabase/schema.sql` ("v2") di SQL Editor: menambah kolom foto nota dan bucket privat `receipts`. Bila insert bucket ditolak, buat manual di **Storage → New bucket** (`receipts`, Public OFF).
Jika tabel `activity_log` belum ada, jalankan ulang seluruh `supabase/schema.sql` (aman dijalankan berulang).

## 6. Impor CSV
Pengaturan → **Impor CSV transaksi**. Kolom: `tanggal` (YYYY-MM-DD atau DD/MM/YYYY), `jenis` (masuk/keluar), `jumlah`, `kategori`, `akun`, `catatan`, `mata uang` (IDR/USD). Ada pratinjau, baris bermasalah dilewati, dan kategori/akun baru hanya dibuat bila dicentang. Baris yang sama (tanggal, jenis, jumlah, dan catatan identik) dengan data yang sudah ada atau dengan baris lain dalam berkas ditandai duplikat dan dilewati.

## 7. Cadangan data
Pengaturan → **Cadangan data** → *Unduh cadangan (JSON)*: satu berkas berisi seluruh tabel (akun, kategori, transaksi, hutang, pembayaran cicilan, langganan, budget, target, kurs). Simpan berkas ini sebagai cadangan rutin.

## 8. PWA & bahasa
- Aplikasi bisa dipasang di layar utama HP (ikon aplikasi, tampilan penuh layar) — buka di browser HP → "Tambahkan ke layar utama". Tidak ada mode luring.
- Sakelar **ID/EN** di sidebar (atau header di HP) mengganti bahasa tampilan; pilihan disimpan di browser.


## Keamanan
- Database hanya diakses server dengan service role; RLS aktif & tanpa akses publik.
- Login via cookie httpOnly bertanda tangan HMAC, berlaku 7 hari.
- Endpoint n8n dilindungi API key (perbandingan timing-safe) dan validasi input zod.
