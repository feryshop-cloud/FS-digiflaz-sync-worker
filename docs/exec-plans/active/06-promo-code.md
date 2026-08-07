# Plan 06 — Kode Promo di Checkout

Kasus: kode promo diterapkan saat checkout, memengaruhi harga final. Dokumen ini merangkum cara kerja saat ini + rencana perbaikan celah yang ditemukan.

## Alur saat ini

```
input kode → POST /api/promo-codes/validate
  → cari di promo_codes (DB) / fallback hardcoded (FERYSHOP10, HEMAT5RB, NEWUSER)
  → cek min_order
  → hitung discount & final_price
  → onApplied({code,discount,finalPrice}) → parent order/[slug]/page.tsx
  → override productPrice = promoFinalPrice → subtotal → total → bayar
  → persist promoCode/promoDiscount/promoPrice/karena_partials ke orders
  → invoice tampil promo_discount
```

### Komponen terkait

- `src/components/order/PromoCodeSection.tsx` — input, daftar promo, apply/clear, dialog.
- `src/app/api/promo-codes/route.ts` — daftar promo (DB, fallback built-in).
- `src/app/api/promo-codes/validate/route.ts` — validasi + hitung diskon.
- `src/app/order/[slug]/page.tsx` — terapkan `promoFinalPrice` ke subtotal/total.
- `src/lib/db/schema.ts:150-163` — tabel `promo_codes`.

### Kolom tersedia `promo_codes`

`code, discount_type (percent/fixed), discount_value, min_order, max_discount, quota, used_count, is_active, start_date, end_date`.

## Celah yang ditemukan (perlu diperbaiki)

1. **`subtotal = 0` di validate** — `PromoCodeSection` tidak mengirim `total_price`/`subtotal` pada body POST validate. Di `validate/route.ts:13` → `subtotal = 0` → cek `min_order` selalu lolos & hitungan percent dari 0 (→ diskon 0). Harga riil dihitung ulang di parent (bug konsisten, tapi logika server salah).
   - **Fix proposal**: `PromoCodeSection.applyPromo` kirim harga unit (`price`) × quantity, atau validate cukup mengembalikan rumus diskon + server terima subtotal dari server-side rekomputasi harga produk (idempotent, jangan terima harga mentah dari client).

2. **`quota`/`used_count` tak dicek** — validate tidak mengecek kuota maupun menambah `used_count`. Kolom ada tapi tak dipakai.

3. **`start_date`/`end_date` tidak divalidasi** — kode ter-apply walaupun belum aktif / sudah kadaluarsa.

4. **Diskon dihitung di client** — `final_price` dikirim client; rawan dimanipulasi. Idealnya total akhir dihitung & diverifikasi server saat order (POST `/api/order`), dan bila kode promo dipakai, quote dicek ulang server-side.

## Temuan: tabel `promo_codes` belum ada di database

- Query `information_schema.columns → promo_codes` **kosong** → tabel belum dibuat di Supabase live.
- Tidak ada migration `CREATE TABLE public.promo_codes` di **game-inventori** maupun **FS-Public**.
- Akibat: `db.select().from(promoCodes)` gagal → fallback log → **hardcoded** (`FERYSHOP10`, dll) selalu dipakai. Admin tidak bisa kelola karena tabelnya tak ada.

## Rencana: migration + RLS + Admin UI CRUD

Kesepakatan baru: admin bisa mengelola kode promo. **Tabel `promo_codes` dibuat diakses diakses `game-inventori`** (pemilik skema produk/order, pola sama seperti `0020/create_promo_codes`).

### Migration baru — `0044_promo_codes.sql` (SUDAH DITERAPKAN live ✅)

> **Catatan nomor**: 0042 = product_categories (plan 01), 0043 = sync RPC (plan 05), 0044 = promo_codes, 0045 = fix trigger audit (temuan eksekusi). Jangan pakai nomor lama.

```sql
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id serial PRIMARY KEY,
  code varchar(100) NOT NULL UNIQUE,
  discount_type varchar(50) NOT NULL DEFAULT 'percent',   -- percent | fixed
  discount_value numeric(15,2) NOT NULL,
  min_order numeric(15,2) DEFAULT 0,
  max_discount numeric(15,2) DEFAULT 0,
  quota integer DEFAULT 100,
  used_count integer DEFAULT 0,
  is_active boolean DEFAULT true,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
-- NOTE: JANGAN SET RLS read public → bocor kode (R4).
-- Validasi via RPC SECURITY INVOKER + list admin via policy is_admin().
-- Tulis hanya admin
CREATE POLICY "promo_codes admin all"
  ON public.promo_codes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
```

RPC validasi (signature konkret, P7):

```sql
-- SECURITY INVOKER: RLS pemanggil tetap berlaku → blok baca tak dijamin jika tak add select policy.
CREATE OR REPLACE FUNCTION public.validate_promo(p_code text, p_subtotal numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; discount numeric;
BEGIN
  SELECT * INTO r FROM public.promo_codes WHERE code = p_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'err', 'not_found');
  ELSIF NOT r.is_active THEN RETURN jsonb_build_object('ok', false, 'err', 'inactive');
  ELSIF r.start_date IS NOT NULL AND r.start_date > now() THEN RETURN jsonb_build_object('ok', false, 'err', 'not_started');
  ELSIF r.end_date IS NOT NULL AND r.end_date < now() THEN RETURN jsonb_build_object('ok', false, 'err', 'expired');
  ELSIF p_subtotal < r.min_order THEN RETURN jsonb_build_object('ok', false, 'err', 'min_order');
  ELSIF r.used_count >= r.quota THEN RETURN jsonb_build_object('ok', false, 'err', 'quota');
  END IF;
  discount := CASE WHEN r.discount_type = 'percent' THEN p_subtotal * r.discount_value / 100
              ELSE r.discount_value END;
  IF r.max_discount > 0 AND discount > r.max_discount THEN discount := r.max_discount; END IF;
  RETURN jsonb_build_object('ok', true, 'code', r.code, 'discount', discount, 'discount_type', r.discount_type,
    'discount_value', r.discount_value, 'min_order', r.min_order, 'max_discount', r.max_discount,
    'used_count', r.used_count, 'quota', r.quota, 'start_date', r.start_date, 'end_date', r.end_date);
END $$;
GRANT EXECUTE ON FUNCTION public.validate_promo(text, numeric) TO anon, authenticated;
```

> **Keputusan final (P7/R4, sudah dieksekusi)**: pakai `SECURITY DEFINER` utk `validate_promo` — expose hanya field yang diperlukan. Publik tak butuh policy read `promo_codes`; satu-satunya pintu baca = fungsi.
>
> **Grant diterapkan live**: `validate_promo` → `anon, authenticated` (storefront mohon); `sync_digiflazz_products` → hanya `service_role`.
>
> **Temuan eksekusi — blocker trigger audit (`0045_fix_audit_trigger_nonuuid.sql`)**:
>
> - Trigger `trg_audit_products` (AFTER UPDATE products) → `process_audit_log()` cast `new.id` ke uuid.
> - `products.id` = teks (`ff_70_diamond`) → cast uuid gagal → **semua UPDATE/DELETE produk crash**.
> - Root: migrasi 0030/0037 asumsi id uuid.
> - Fix: helper `audit_to_uuid(anyelement)` IMMUTABLE + `SET search_path=public`; `process_audit_log()` pakai helper utk `related_id` (non-uuid → NULL).

(Pola RLS mengikuti `promotional_templates` di `0029`/`0040`.)

### Admin UI — `game-inventori/app/dashboard/…promo-codes`

- Server actions (pola `app/actions/topup-orders.ts`): `listPromoCodes`, `createPromoCode`, `updatePromoCode`, `deletePromoCode`.
- Halaman CRUD di dashboard (list + form insert/edit: kode, diskon type/value, min_order, max_discount, kuota, is_active, start/end).
- Tambah menu sidebar (pattern `components/layout/Sidebar.tsx:86`).
- Register skema utk `promo_codes` di `types/database.types.ts` (pola `0020_create_orders_table.sql`).

### Sinkronisasi storefront — FS-Public

- Pastikan skema `src/lib/db/schema.ts:150-163` cocok dgn migration (kolom sudah ada).
- Optional: lepas fallback hardcoded agar hanya DB yg otoritatif.

## Rencana perbaikan (dgn mitigasi risiko)

| #   | Perbaikan                                                                                                                       | File                                      | Risiko yg dimitigasi |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------- |
| A   | Migration `promo_codes` + RLS                                                                                                   | game-inventori migration baru             | R5, R6               |
| B   | Admin UI CRUD kode promo (list/form/delete)                                                                                     | game-inventori `app/actions` + dashboard  | R5                   |
| C   | Amend validasi `subtotal / is_active / start_date <= now <= end_date / used_count < quota`; increment atomik pada success order | `validate/route.ts`, `api/order/route.ts` | R2                   |
| D   | Rekomputasi & revalidasi diskon **server-side** saat `api/order` (jangan percaya `final_price` client)                          | `api/order/route.ts`                      | R1                   |
| E   | Increment kuota **atomik** (`UPDATE ... SET used_count=used_count+1 WHERE used_count < quota`) + cek rowcount                   | `api/order/route.ts`                      | R3                   |
| F   | Seed awal kode promo (sebelum cabut fallback)                                                                                   | game-inventori seed/dispatcher            | R6                   |
| G   | Lepas fallback hardcoded di storefront setelah DB berjalan                                                                      | `promo-codes/*.ts`                        | R8                   |

## Migrasi perbaikan tsb dgn analisis risiko — rinci

### R1/R2 — diskon tidak dipercaya dari client; total dihitung ulang

- `validate/route.ts` **hanya** mengembalikan `{code, discount_type, discount_value, min_order, max_discount, quota, used_count, start_date, end_date, is_active}` — **bukan** `final_price` hasil client.
- Parent submit `promo_code` + `product_id` + `quantity` ke `/api/order`.
- `/api/order` **re-kalkulasi** harga produk dari DB (idempotent), hitung ulang diskon, lalu tulis `orders`. Tolak bila diskon client ≠ server (guard).

### R3 — increment atomik (anti race kuota)

```sql
UPDATE public.promo_codes
SET used_count = used_count + 1
WHERE code = :code AND used_count < quota;
```

- Cek rowcount = 1 → kuota dipakai; 0 → kuota penuh, order ditolak.
- Lakukan dalam transaksi bersama insert order; harga & kuota validated lewat RPC `validate_promo` / guard server-side `/api/order`.
- **Implementasi (update 8 Agu 2026)**: `api/order/route.ts` reserve kuota atomik (`RETURNING code`, rowcount 0 → tolak 400) **sebelum** insert order; bila insert order gagal → rollback `used_count` (`greatest(x-1,0)`). Tidak ada baris orfan / oversell.

### R4 — RLS read public itu bocor kode

- JANGAN `SELECT USING (true)` tanpa batas; JANGAN pinjamkan policy SELECT publik utk semua baris.
- Ganti ke **RPC `validate_promo` `SECURITY DEFINER`** utk `validate` — expose hanya field yang diperlukan, bypass RLS di dalam fungsi, publik tak perlu akses tabel.
- List admin via policy `is_admin()` saja.

### R7 — Edit diskon saat checkout

- Snapshot total + diskon di `orders.promo_discount` saat order dibuat.
- Validasi awal hanya saat apply; tidak ada re-quote setelah order.

## Verifikasi — STATUS: SELESAI ✅ (8 Agu 2026)

- **Migration** `promo_codes` + RPC `validate_promo` live ✅; advisor warning `validate_promo` **by design** (SECURITY DEFINER terkontrol, output terbatas; storefront butuh).
- **RPC `validate_promo` diuji live**: `not_found`/`min_order` benar; `FERYSHOP10` (50k) → diskon 5k cap 15k; `HEMAT5RB` (35k) → diskon 5k.
- **Seed kode legasi** live ke DB (FERYSHOP10, HEMAT5RB, NEWUSER) — cadangan fallback hardcoded yang dilepas.
- **Storefront** (FS-Public):
  - `validate/route.ts` — subtotal dihitung **server-side** dari harga produk DB × qty (R1); pakai RPC `validate_promo`; kembalikan `data.promo` + `data.pricing` (shape oczekiwanie client).
  - `promo-codes/route.ts` (list) — baca DB via pool, hapus fallback hardcoded (R8/G); shape cocok `PromoCodeSection`.
  - `api/order/route.ts` — re-validasi promo + rekomputasi harga/total server-side (R1/D), reserve kuota atomik `used_count < quota` (RETURNING, rowcount 0 → tolak) + rollback bila insert gagal (R3/E).
  - `src/lib/promo.ts` — helper `callValidatePromo` / `getProductUnitPrice` / `computeDiscount`.
  - FS-Public lint + build hijau.
- **Admin UI** (`game-inventori`): `app/actions/promo-codes.ts` (list/create/update/delete), `app/dashboard/promo-codes/page.tsx` (table + form CRUD, kuota/status/periode), menu sidebar "Kode Promo". Lint + build hijau.
- **Sisa opsional**: worker deployment (plan 05), verifikasi end-to-end checkout manual.
