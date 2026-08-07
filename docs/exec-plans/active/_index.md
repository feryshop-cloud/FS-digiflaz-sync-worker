# FS-digiflaz-sync-worker — Plan Index

Dokumen rencana dipecah per-topik. Buka sesuai kebutuhan, bukan baca semua.

| Dokumen                                                  | Isi                                                                         | Status                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| [01-schema.md](01-schema.md)                             | Migration `products` + tabel `product_categories` + RLS                     | ✅ diterapkan (0042)                                      |
| [02-feature-flag-pricing.md](02-feature-flag-pricing.md) | Feature-flag `pricing.member_price` (hardcode false)                        | ✅ selesai (`ea096e1`)                                    |
| [03-storefront.md](03-storefront.md)                     | Perubahan FS-Public (schema, live-adapter, types, UI)                       | ✅ selesai (`478a80f`)                                    |
| [04-product-images.md](04-product-images.md)             | Gambar produk: reuse logo game (fallback order-config) + games row HOK/CODM | ✅ selesai                                                |
| [05-sync-worker.md](05-sync-worker.md)                   | Alur worker cron, mapping, batch RPC (0043), stale, secret                  | ✅ RPC live; **worker selesai** (test 3/3)                |
| [06-promo-code.md](06-promo-code.md)                     | Kode promo: migration (0044) + RPC + 0045 blocker audit                     | ✅ migrasi live + **storefront/backend/admin UI selesai** |
| [07-verifikasi.md](07-verifikasi.md)                     | **Plan akhir**: status eksekusi, kriteria GO, verifikasi                    | → lihat status                                            |

## Konteks singkat

- Worker Cloudflare (cron) sinkron harga produk Digiflazz → Supabase project `game-inventory` (`trviikqvvujcibplqwud`).
- Skema pemilik: `game-inventori` (multi-repo).
- Arah utama: `product_categories` terpisah, `category_id` attach/detach, kolom sync baru, gold/platinum **tetap di DB** di belakang feature-flag hardcode **false**.
- **Penomoran migrasi terpasang**: 0042 = product_categories, 0043 = sync RPC, 0044 = promo_codes, **0045 = fix trigger audit** (temuan eksekusi; prerequisite supaya UPDATE/DELETE produk tidak crash).
- **PENTING**: migrasi 0042–0045 SUDAH live; storefront (03/04), worker cron (05), admin promo UI (06) **SELESAI 8 Agu 2026**.
