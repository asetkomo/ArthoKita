# Dompetku × n8n — Panduan Setup

Arsitektur: **n8n = orkestrator tipis**, **web Dompetku = otak**. n8n menerima update Telegram, memfilter chat, lalu meneruskannya ke `POST /api/public/n8n/bot`. Web mengembalikan `{ method, text, reply_markup }` yang langsung diteruskan ke Telegram Bot API. Semua logika (parser, OCR, kategori, laporan, tombol) ada di repo dan dites.

| File | Isi |
|---|---|
| `01-dompetku-telegram-bot.json` | Bot utama: chat, foto struk, perintah `/`, tombol inline |
| `02-dompetku-jadwal.json` | Pengingat tagihan 08:00, rekap harian 21:00, laporan mingguan (Senin) & bulanan (tgl 1) |
| `03-dompetku-error-handler.json` | Notifikasi Telegram saat workflow gagal |
| `04-dompetku-setup-commands.json` | Sekali jalan: daftarkan menu `/` di Telegram + cek webhook |

Endpoint yang dipanggil workflow (semua dengan header `x-api-key`; daftar lengkap di `docs/SETUP.md` §4):

| Workflow | Method & path | Field respons yang dipakai |
|---|---|---|
| 01 | `POST /api/public/n8n/bot` body `{ update_id, chat_id, text?, image_base64?, mime_type?, callback_data? }` | `method`, `text`, `reply_markup`, `toast` |
| 02 | `GET /api/public/n8n/reminders?days=3` | `count`, `message` |
| 02 | `GET /api/public/n8n/report?period=today\|lastweek\|lastmonth` | `message` |

## 1. Siapkan web (Vercel)
1. Merge branch `feat/telegram-bot-v2`, lalu jalankan bagian **v7** di `supabase/schema.sql`.
2. Pastikan `N8N_API_KEY` sudah diisi (string acak **≥ 24 karakter**; bila kosong/lebih pendek semua endpoint n8n membalas 503).
   Env Vercel baru: `BOT_DEFAULT_ACCOUNT` (mis. `BCA`), `BOT_ALLOWED_CHAT_IDS` (wajib, chat_id Anda; kosong = semua chat ditolak dan bot membalas dengan chat_id yang perlu ditambahkan), opsional `AI_MODEL_TEXT`, `BOT_TEXT_AI=auto` (`auto` | `always` | `never`), `APP_TIMEZONE` (default `Asia/Jakarta`; samakan dengan zona waktu workflow agar `period=today` tepat).
3. AI (rekomendasi Gemini via endpoint OpenAI-compatible):
   ```
   AI_API_URL=https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
   AI_API_KEY=<API key dari aistudio.google.com>
   AI_MODEL=gemini-2.5-flash          # OCR struk (vision)
   AI_MODEL_TEXT=gemini-2.5-flash-lite  # chat ambigu (lebih murah)
   ```
   Tanpa `AI_API_URL` server memakai Lovable AI gateway (nama model berawalan `google/…`, lihat `docs/SETUP.md`). Endpoint Gemini langsung memakai nama model tanpa prefix seperti di atas.
4. Durasi fungsi Vercel untuk `/api/public/n8n/bot` sudah diset 60 detik lewat `vite.config.ts` (`vercel.functionRules`); pastikan paket Vercel Anda mengizinkan ≥ 60 detik.

## 2. Buat bot Telegram
1. @BotFather → `/newbot` → simpan token.
2. Cari chat_id Anda: kirim pesan ke @userinfobot (atau lihat `message.chat.id` di eksekusi n8n pertama).

## 3. Env n8n (docker compose)
```yaml
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    restart: unless-stopped
    ports: ["127.0.0.1:5678:5678"]   # expose via reverse proxy HTTPS (Caddy/Traefik/Cloudflare Tunnel)
    environment:
      - N8N_HOST=n8n.domainanda.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.domainanda.com/
      - GENERIC_TIMEZONE=Asia/Jakarta
      - TZ=Asia/Jakarta
      - N8N_ENCRYPTION_KEY=<openssl rand -hex 32, SIMPAN baik-baik>
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false   # workflow membaca $env di bawah
      - N8N_RUNNERS_ENABLED=true
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168          # hapus riwayat eksekusi > 7 hari
      # Variabel yang dipakai workflow:
      - FINTRACK_URL=https://dompetku-anda.vercel.app
      - TELEGRAM_BOT_TOKEN=<token BotFather>
      - TELEGRAM_ALLOWED_CHAT_IDS=<chat_id Anda>     # pisahkan koma bila >1
      - TELEGRAM_ADMIN_CHAT_ID=<chat_id Anda>
    volumes: ["n8n_data:/home/node/.n8n"]
volumes: { n8n_data: {} }
```
Telegram Trigger butuh URL **HTTPS publik**. Jangan expose port 5678 langsung tanpa TLS.

## 4. Credential di n8n
1. **Telegram API** → nama bebas, isi token bot (dipakai Telegram Trigger).
2. **Header Auth** → Name: `x-api-key`, Value: nilai `N8N_API_KEY` di Vercel. Beri nama `Fintrack x-api-key` (dipakai node `Fintrack /bot` di workflow 01 dan keempat node HTTP di workflow 02).

## 5. Impor & aktifkan
1. Impor keempat file JSON (Workflows → Import from file). Pilih ulang credential di node yang bertanda merah.
2. Buka Settings workflow 01 & 02 → **Error Workflow** = `Dompetku – Error Handler`.
3. Aktifkan workflow 01, lalu jalankan manual workflow 04 (menu perintah `/` muncul di Telegram).
4. Aktifkan workflow 02.

## 6. Uji cepat
| Kirim | Harapan |
|---|---|
| `/help` | daftar perintah |
| `kopi 25rb` | pratinjau ⚡ tanpa AI, kategori Makanan & Minuman, akun default |
| `makan siang 45rb pakai gopay` | akun GoPay |
| foto struk (+caption `pakai BCA` opsional) | pratinjau 🧾 dengan item |
| tekan 🏷 / 🏦 / 🔁 lalu ✅ | pesan berubah jadi ✅ Tercatat + ↩️ Undo |
| tekan ✅ dua kali | "Sudah tersimpan", tidak dobel |
| `/minggu`, `/bulan`, `/saldo`, `/paylater`, `/langganan`, `/tagihan 30`, `/budget` | laporan (0 token AI) |
| chat dari akun lain | diabaikan |

## Hemat token
- Perintah `/…` dan tombol: **0 token**.
- Chat sederhana: parser regex + kata kunci + riwayat kategori → **0 token**. AI hanya untuk pesan ambigu (`BOT_TEXT_AI=never` untuk mematikan total).
- Foto struk: 1 panggilan vision per foto (±1–2 rb token). Gambar dibatasi ±3 MB.
- Tidak ada AI Agent/memori percakapan di n8n, sehingga tidak ada token sistem prompt berulang.

## Keamanan
- Allow-list berlapis: filter `chatIds` di trigger → `Normalize & Guard` (fail-closed) → `BOT_ALLOWED_CHAT_IDS` di server (wajib, juga fail-closed: kosong = tolak semua, tanpa menyentuh DB).
- API key tersimpan terenkripsi sebagai credential n8n; perbandingan timing-safe di server.
- Data eksekusi sukses tidak disimpan (`saveDataSuccessExecution: none`) agar foto struk & data keuangan tidak menumpuk di DB n8n.
- Undo dibatasi untuk transaksi dari bot berumur ≤ 7 hari.

## Skalabilitas
Untuk satu pengguna, mode default (SQLite) sudah cukup. Bila beban naik: pakai Postgres (`DB_TYPE=postgresdb`), lalu queue mode (`EXECUTIONS_MODE=queue` + Redis + worker). Workflow tidak perlu diubah karena state disimpan di Supabase (`bot_drafts`), bukan di n8n.
