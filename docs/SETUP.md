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
| `APP_TOTP_SECRET` | opsional, kunci base32 untuk login 2 langkah (TOTP, kode 6 digit). Kosong = login seperti biasa. Lihat bagian *Login 2 langkah* |
| `N8N_API_KEY` | string acak ≥ 24 karakter, dipakai n8n di header `x-api-key` |
| `AI_API_KEY` | API key untuk OCR / parsing chat (OpenAI-compatible) |
| `AI_API_URL` | opsional, default Lovable AI gateway. Contoh OpenAI: `https://api.openai.com/v1/chat/completions` |
| `AI_MODEL` | opsional, mis. `gpt-4o-mini` atau `google/gemini-2.5-flash` (dipakai OCR/vision) |
| `AI_MODEL_TEXT` | opsional, model lebih murah untuk parsing chat (mis. `gemini-2.5-flash-lite`). Default = `AI_MODEL` |
| `BOT_DEFAULT_ACCOUNT` | opsional, nama akun default untuk transaksi bot bila akun tidak disebut (mis. `BCA`) |
| `BOT_ALLOWED_CHAT_IDS` | wajib untuk bot, daftar chat_id Telegram yang diizinkan (pisahkan koma). Kosong = semua chat ditolak; bot membalas dengan chat_id Anda agar mudah ditambahkan |
| `BOT_TEXT_AI` | opsional: `auto` (default, AI hanya bila pesan ambigu), `always`, atau `never` (0 token untuk chat) |
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
| POST | `/api/public/n8n/bot` | **Satu pintu bot Telegram.** `{ update_id, chat_id, text?, image_base64?, mime_type?, callback_data? }` → `{ method: "send"\|"edit"\|"none", text, reply_markup, toast? }` siap diteruskan ke Telegram Bot API. Chat & foto nota menjadi pratinjau dengan tombol ✅/❌/🏷/🏦/🔁 |
| GET | `/api/public/n8n/report?period=…` | Laporan periode: `today`, `yesterday`, `week`, `lastweek`, `month`, `lastmonth`, `YYYY-MM`, `YYYY-MM-DD` |
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

## Pembaruan v3 (catatan aktivitas, Emas, Piutang)
1. Buka Supabase → SQL Editor, tempel ulang seluruh `supabase/schema.sql` (aman dijalankan ulang) atau cukup bagian **v3**.
2. Halaman baru: **Emas** (`/gold`) dan **Piutang** (`/receivables`). Sebelum skema v3 dijalankan, halaman tetap terbuka dengan pesan petunjuk.
3. Harga emas: harga dunia dari `api.gold-api.com` (XAU→IDR/gram memakai kurs harian) dan harga Antam dari logammulia.com. Disimpan sekali sehari di tabel `gold_prices`; jika sumber gagal dipakai harga terakhir, atau perkiraan (ditandai "perkiraan").
4. Tarik tunai ATM: tombol **Tarik tunai** di halaman Transaksi, atau kirim ke bot `POST /api/public/n8n/command` dengan `{ "text": "tarik tunai 500rb dari BCA" }`. Tercatat sebagai transfer ke akun bertipe Tunai (dibuat otomatis oleh bot jika belum ada).

## v4 — Biaya admin, biaya bulanan akun, pajak langganan
Jalankan bagian **v4** di `supabase/schema.sql` (aman dijalankan ulang). Sebelum itu aplikasi tetap berjalan; kolom baru diabaikan.
- **Preset biaya per akun** (halaman Akun): `BI-FAST=2500; Online=6500` untuk transfer keluar, dan preset admin top-up untuk e-wallet tujuan.
- **Biaya transfer/admin** di formulir transaksi baru: isi manual atau klik preset; dicatat sebagai pengeluaran terpisah kategori "Biaya Admin" dari akun asal.
- **Biaya bulanan otomatis**: isi nominal + tanggal potong di akun. Dicatat sekali per bulan saat dashboard/pengingat dibuka (termasuk panggilan n8n `/api/public/n8n/reminders`), dan muncul di daftar pengingat.
- **Pajak langganan**: kolom pajak % opsional; total tagihan & pembayaran = harga + pajak.

## v8 — Target tabungan tertaut akun
Jalankan bagian **v8** di `supabase/schema.sql` (kolom `goals.account_id`). Sebelum itu aplikasi tetap berjalan; pilihan akun tabungan diabaikan.
- Di formulir target, pilih **Akun tabungan** (opsional).
- **Tambah nominal** dengan "Dari akun" berbeda dari akun tabungan → tercatat sebagai transfer `Setor target <nama>` ke akun tabungan. **Tarik dana** → transfer `Tarik target <nama>` dari akun tabungan ke akun pilihan (maksimal sebesar dana terkumpul).
- Tanpa akun, hanya angka "Sudah terkumpul" yang berubah (perilaku lama). Tidak pernah dicatat sebagai pengeluaran, jadi total kekayaan tidak berubah.

## v7 — Bot Telegram dengan pratinjau & tombol
1. Jalankan bagian **v7** di `supabase/schema.sql` (kolom `transactions.external_id` + tabel `bot_drafts`).
2. Set env `BOT_ALLOWED_CHAT_IDS` (wajib; kosong = semua chat ditolak), `BOT_DEFAULT_ACCOUNT`, dan (opsional) `AI_MODEL_TEXT`. Belum tahu chat_id? Kirim pesan ke bot: balasannya "Bot belum dikonfigurasi: tambahkan chat_id … ke BOT_ALLOWED_CHAT_IDS".
3. Impor workflow n8n dari folder `n8n/` (lihat `n8n/README.md`).

Alur: pesan/foto → `POST /api/public/n8n/bot` → pratinjau + tombol → tekan ✅ → tersimpan (idempoten; klik ganda atau retry tidak menggandakan) → tombol ↩️ Undo.
Chat sederhana ("kopi 25rb", "gaji 8jt ke BCA") diurai tanpa AI; kategori ditebak dari kata kunci lalu riwayat transaksi. AI hanya untuk foto nota dan chat yang ambigu.

Perintah bot (daftarkan di BotFather → /setcommands):
```
hariini - Laporan hari ini
kemarin - Laporan kemarin
minggu - Laporan minggu ini
bulan - Laporan bulan ini (opsional YYYY-MM)
bulanlalu - Laporan bulan lalu
pemasukan - Daftar pemasukan (hariini/minggu/bulan)
pengeluaran - Daftar pengeluaran (hariini/minggu/bulan)
saldo - Saldo semua akun
paylater - Paylater, cicilan & hutang
langganan - Langganan aktif & tagihan
tagihan - Tagihan jatuh tempo (opsional jumlah hari)
budget - Pemakaian budget bulan ini
piutang - Piutang yang belum lunas
bayar - Catat bayar langganan/cicilan
tarik - Tarik tunai, mis. /tarik 500rb dari BCA
undo - Hapus transaksi terakhir dari bot
help - Bantuan
```

## Login 2 langkah (TOTP)
1. Login, buka **Pengaturan → Verifikasi dua langkah (2FA)** → **Buat kunci rahasia**.
2. Tambahkan kunci itu di Google Authenticator / Aegis (tambah akun → masukkan kunci manual, berbasis waktu) atau impor URI `otpauth://`.
3. Simpan kunci yang sama sebagai `APP_TOTP_SECRET` di Vercel → redeploy. Setelah itu login meminta kode 6 digit setelah password.
4. Menonaktifkan / ganti HP: hapus atau ganti `APP_TOTP_SECRET` lalu redeploy. Simpan cadangan kunci; kalau hilang, akses Vercel adalah jalan pemulihannya.

Catatan: toleransi jam ±30 detik; kode yang sudah dipakai ditolak (per instance server); salah kode ikut dihitung batas percobaan login (8 gagal / 15 menit).
