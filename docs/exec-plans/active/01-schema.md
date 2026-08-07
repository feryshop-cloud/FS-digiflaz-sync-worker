# Plan 01 — Skema DB: Migration `0042_product_categories.sql` (SUDAH DITERAPKAN live ✅)

Pemilik skema: **`game-inventori`** (multi-repo) — semua ALTER dibuat di sana.

> **Catatan nomor**: migration tertinggi live = `0041`. Nomor `0027` TIDAK lagi digunakan (tabrakan dgn `0027_rls_admin_scoped_reads.sql`). Gunakan **0042**. Eksekusi aktif: 0042, 0043, 0044, **0045** (fix trigger audit — temuan eksekusi).

File: `game-inventori/supabase/migrations/0042_product_categories.sql`

## 0. Seed & remap kategori — SEBELUM re-attach FK (mitigasi P2, SUDAH DIJALANKAN)

Jangan drop FK selagi `product_categories` kosong. **Implementasi aktual** (bukan dummy): seed dari tabel `categories` existing (4 baris: Top Up Games, Voucher Game, Listrik, Entertainment) via `SELECT c.title, lower(replace(c.title,' ','-')), row_number() ...`; pada migration tsb pd `product_categories`. Remap: join by title → `category_id` produk lama diarahkan. Produk tanpa kategori (53/55) dibiarkan NULL & sync berlabels di plan 05.

## 1. Tabel kategori produk (terpisah dari `categories`)

```sql
CREATE TABLE IF NOT EXISTS public.product_categories (
  id         serial PRIMARY KEY,
  title      varchar(100) NOT NULL,
  slug       varchar(100) UNIQUE,
  sort_order integer DEFAULT 0,
  is_active  boolean DEFAULT true,
  created_at timestamp DEFAULT now() NOT NULL
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
```

## 2. Lepas FK lama ke `categories`, attach ke `product_categories`

```sql
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_category_id_fkey;

ALTER TABLE public.products
  ADD CONSTRAINT fk_products_product_category
  FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE SET NULL;
```

- `ON DELETE SET NULL` = **detach**: hapus kategori → produk otomatis ke "Top Up".
- Attach = produk muncul di kategori storefront.
- Urutan ini hanya valid KALAU langkah 0 (seed+remap) dijalankan lebih dulu.

## 3. Kolom baru untuk sinkronisasi + tampilan

```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description    text,
  ADD COLUMN IF NOT EXISTS start_cut_off  varchar(5),
  ADD COLUMN IF NOT EXISTS end_cut_off    varchar(5),
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS provider       varchar(50) DEFAULT 'digiflazz',
  ADD COLUMN IF NOT EXISTS provider_ref   varchar(255);
```

## 4. Yang TIDAK dilakukan

- **Jangan drop** `selling_price_gold` / `selling_price_platinum` — dipertahankan di belakang feature-flag (lihat 02).
- **Jangan ubah** `categories` / `games.category_id` — di luar scope, dipakai homepage.

## RLS `product_categories`

- `SELECT USING (true)` — public read.
- `ALL USING (public.is_admin())` — admin full (pola sama seperti `categories`).

## Verifikasi

- `game-inventori`: jalankan migration berurutan (`supabase db push`), cek advisors (RLS). Pastikan nomor `0042` tidak tabrakan dgn `0041`.
