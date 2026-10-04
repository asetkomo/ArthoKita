# Finance Buddy

hi saya ingin membuat aplikasi web yg bisa track pemasukan dan pengeluaran beserta cicilan seperti paylater atau hutang dan ada dasboard serta remindernya untuk tiap bulan, dan saya juga ada beberapa subsribtion langganan bulanan dan tahunan ada dalam idr dan usd, apalagi yg ingin anda tahu supaya web appsnya bisa lengkap dan jadi web app expense tracking terbaik? dan fitur unggulan nntinya adalah ocr dari foto nota serta bot @connector:telegram:"Telegram" atau whatsapp untuk laporan langsung income dan expense secara gampang dan akan di record secara detail oleh sistem. rencana saya akan menggunakan n8n tinggal nnti beri tahu saja end pointnya di edit di bagian mana, dan n8n akan saya handling. database gunakan supabase saja yg online, dan pastikan bisa di hosting di vercel langsung. pastikan secure aman scallable dan best practice, untuk login gunakan id password yg didaftarkan di env nntinya.

## Fitur utama

- Pemasukan, pengeluaran, transfer, cicilan/hutang, langganan IDR/USD, budget, target tabungan, emas & piutang
- OCR foto nota (hingga 5 foto per transaksi), split satu nota ke beberapa kategori, cari nama item nota
- Transaksi berulang (gaji, sewa, transfer rutin) yang dicatat otomatis
- Budget rollover & peringatan instan 80%/100% (web dan bot)
- Laporan per akun, grafik saldo & rekonsiliasi rekening koran
- Bot Telegram (pratinjau sebelum simpan, /undo) + otomasi n8n (pengingat, laporan, backup mingguan)
- Cadangan & pulihkan JSON, login 2 langkah (TOTP), monitoring error (Sentry opsional), PWA, ID/EN, mode gelap

Panduan pemasangan: [docs/SETUP.md](docs/SETUP.md).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4bf32ccd-abed-4404-af2e-9d7728aeedd8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
