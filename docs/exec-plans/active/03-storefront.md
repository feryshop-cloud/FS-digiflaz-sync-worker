# Plan 03 — Storefront FS-Public (SELESAI ✅)

Perubahan aplikasi storefront agar mendukung kolom sync + grup kategori + feature-flag harga.

> **Status**: migrasi DB (0042–0045) live ✅; **feature-flag harga (bagian 02) selesai ✅** (commit `ea096e1`); **schema/live-adapter/types/UI ✅** (commit `478a80f`).

## `src/lib/db/schema.ts`

- Tambah tabel `productCategories`.
- Tambah kolom pada `products`: `description`, `start_cut_off`, `end_cut_off`, `last_synced_at`, `provider`, `provider_ref`.
- **Pertahankan** `sellingPriceGold` / `sellingPricePlatinum`.
- `categoryId` → relasi ke `productCategories`.

## `src/lib/db/live-adapter.ts`

- `getLivePublicProducts()`: tambah kolom select `description, category_id, start_cut_off, end_cut_off`; embed kategori dari `product_categories` untuk grouping.
- Perlu update `PublicProduct` interface.

## `src/types/index.ts`

- `Product`: biarkan `selling_price_gold/platinum` (opsional), tambah `category` / `description` / cut_off.

## `ProductSelection.tsx`

- Grouping tetap via `product.category?.title` (sudut sudah ada di `:42`), kini data kategori datang dari `product_categories`.

## Feature-flag harga (lintas 02) ✅

- **Hardcode `false`** — `MEMBER_PRICE_FLAG` di `src/lib/pricing.ts` (client-safe); `live-adapter.ts` re-export server.
- Bungkus branch role (`selling_price_gold/platinum`) dengan `getPriceByRole`.
- File: `order/[slug]/page.tsx`, `home/promo.tsx`, `price-list/page.tsx`, `ProductSelection.tsx`, `api/price-list/route.ts`.
- Saat flag false, semua jatuh ke `selling_price`. Commit `ea096e1`.
