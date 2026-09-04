# AGENTS.md — FS-digiflazz-service

Microservice terisolasi berbasis **Bun 1.4 + Hono + Docker** yang menjadi pusat integrasi API Digiflazz untuk seluruh ekosistem Feryshop:
1. **Sinkronisasi Katalog Produk**: Menarik pricelist dari Digiflazz API secara berkala dan sinkronisasi ke tabel `public.products` di Supabase.
2. **Cek Saldo Deposit**: Memeriksa saldo deposit via `POST /v1/cek-saldo` dengan in-memory caching.
3. **Validasi Pre-Transaksional**: Memastikan saldo deposit mencukupi (`saldo >= harga_produk + min_reserve`) sebelum transaksi diproses.
4. **Eksekusi & Orkestrasi Transaksi**: Menjalankan transaksi top-up setelah payment gateway mengonfirmasi pembayaran lunas (`payment.paid`).
5. **Background Reconciler**: Memeriksa status transaksi pending secara berkala dan memperbarui tabel `digiflazz_transactions` serta `orders`.

Target deployment: **Docker container di VPS** terhubung ke bridge network `feryshop-network`.

---

## Commands

| Command | Keterangan |
|---|---|
| `bun run dev` | Menjalankan service secara lokal dengan auto-reload (`src/index.ts`) |
| `bun run start` | Menjalankan production server |
| `bun test` | Menjalankan seluruh unit test suite |
| `bun run format` | Menjalankan formatting kode dengan Prettier |

---

## API Endpoints (Internal Network)

| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/health` | Publik | Healthcheck status liveness container |
| `GET` | `/v1/balance` | Service Key | Cek saldo deposit Digiflazz saat ini (`?refresh=true` untuk force refresh) |
| `POST` | `/v1/transactions` | Service Key | Eksekusi transaksi top-up Digiflazz |
| `GET` | `/v1/transactions/:ref_id` | Service Key | Cek status transaksi Digiflazz spesifik (`?sku=...&customer_no=...`) |
| `POST` | `/v1/sync` | Service Key | Trigger manual sinkronisasi produk (asinkron di background) |

---

## Environment Variables

| Variable | Wajib | Deskripsi | Default |
|---|---|---|---|
| `PORT` | Tidak | Port HTTP server | `3002` |
| `NODE_ENV` | Tidak | Environment runtime (`production`, `development`, `test`) | `development` |
| `DIGIFLAZZ_USERNAME` | Ya (Prod) | Username akun Digiflazz | - |
| `DIGIFLAZZ_API_KEY` | Ya (Prod) | Production API key Digiflazz | - |
| `DIGIFLAZZ_BASE_URL` | Tidak | Endpoint dasar API Digiflazz | `https://api.digiflazz.com/v1` |
| `DIGIFLAZZ_USE_DUMMY` | Tidak | Flag gunakan fixture `dummy.json` (tanpa API live) | `false` |
| `DIGIFLAZZ_MIN_RESERVE` | Tidak | Batas minimum saldo cadangan (IDR) | `50000` |
| `SUPABASE_URL` | Ya (Prod) | URL REST endpoint Supabase | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya (Prod) | Secret key Supabase untuk akses DB | - |
| `DIGIFLAZZ_SERVICE_API_KEY` | Ya (Prod) | Secret key autentikasi inter-service antar container | - |
| `SYNC_SECRET` | Tidak | Secret key kompatibilitas lama untuk `/v1/sync` | - |
| `STALE_GUARD_RATIO` | Tidak | Rasio perlindungan de-aktivasi massal produk | `0.3` |

---

## Keamanan & Guardrails

1. **Jaringan Internal**: Service ini berjalan di dalam network Docker bridge `feryshop-network` di VPS dan **TIDAK** diekspos langsung ke internet publik via port mapping ataupun Nginx.
2. **IP Whitelisting**: Request keluar ke API Digiflazz wajib berasal dari IP VPS yang telah di-whitelist di dashboard resmi Digiflazz.
3. **Secret Protection**: Jangan pernah melakukan commit file `.env` atau `.dev.vars` yang memuat `DIGIFLAZZ_API_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`.
