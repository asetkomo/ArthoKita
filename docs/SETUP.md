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
| GET | `/api/public/n8n/summary?month=YYYY-MM` | laporan bulanan |

### Contoh alur n8n
- **Bot Telegram/WhatsApp**: Trigger pesan → jika ada foto: download file → base64 → POST `/ocr`; jika teks: POST `/message` → balas `{{$json.message}}`.
- **Pengingat harian**: Schedule (08:00) → GET `/reminders?days=3` → jika `count > 0` kirim `message` ke Telegram/WhatsApp/Email.
- **Laporan bulanan**: Schedule tanggal 1 → GET `/summary?month=<bulan lalu>` → kirim.

## Keamanan
- Database hanya diakses server dengan service role; RLS aktif & tanpa akses publik.
- Login via cookie httpOnly bertanda tangan HMAC, berlaku 7 hari.
- Endpoint n8n dilindungi API key (perbandingan timing-safe) dan validasi input zod.
