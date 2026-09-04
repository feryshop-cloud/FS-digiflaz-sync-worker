# FS-digiflazz-service

Dedicated containerized microservice untuk integrasi resmi dengan **Digiflazz API** pada ekosistem Feryshop.

## Fitur Utama

- **Pricelist Synchronization**: Menyelaraskan katalog produk Digiflazz ke Supabase `public.products` secara berkala via cron internal (setiap 8 jam) dan on-demand API.
- **Balance Inquiries & Caching**: Memeriksa saldo deposit via `POST /v1/cek-saldo` dengan in-memory caching untuk mengurangi overhead API.
- **Pre-Transaction Validation**: Memvalidasi kecukupan saldo deposit sebelum meneruskan order pelanggan ke provider Digiflazz.
- **Transaction Orchestration**: Mengeksekusi transaksi top-up secara aman setelah pembayaran user dikonfirmasi (*settled*).
- **Background Reconciler**: Memonitor dan memulihkan status transaksi *pending* secara otomatis setiap 2 menit.

## Teknologi

- **Runtime**: Bun 1.4
- **Web Framework**: Hono
- **Testing**: Bun test
- **Container**: Docker (Alpine multi-stage)
