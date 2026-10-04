## Ringkasan

<!-- Apa yang berubah dan kenapa? -->

## Checklist

- [ ] `bun run lint`, `bun run typecheck`, `bun run test`, dan `bun run build` lolos
- [ ] Logika murni baru punya unit test (vitest)
- [ ] Perubahan tabel/kolom ditambahkan sebagai section baru yang idempoten di `supabase/schema.sql` + catatan di `docs/SETUP.md` (atau: tidak ada perubahan skema)
- [ ] Env var baru ditambahkan ke `.env.example` dan fitur tetap aman jika belum di-set
- [ ] Teks UI baru dibungkus `t(...)` dan terdaftar di kamus i18n
- [ ] Dicek manual di layar mobile (light & dark mode)
