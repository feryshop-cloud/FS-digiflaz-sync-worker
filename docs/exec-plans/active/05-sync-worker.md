# Plan 05 — Sync Worker (Cloudflare, cron)

Folder: `FS-digiflaz-sync-worker/` (greenfield). Pola: satu Worker seperti `FS-email-worker`.

## Alur per `Scheduled` cron

1. Panggil REST Digiflazz → daftar produk (format `dummy.json`).
2. Upsert `product_categories` dari `category` string → ambil `id`.
3. Tiap produk:
   - Resolve `brand` → `games` → `game_slug`. **Wajib ada**; jika tidak → logged skip (hindari orphan tanpa `game_slug`).
   - Resolve `category` → `product_categories.id` → `category_id` (attach).
   - Upsert `products` by `id = buyer_sku_code`:
     `title, selling_price, selling_price_gold, selling_price_platinum (salinan utk skema NOT NULL), description, start_cut_off, end_cut_off, game_slug, category_id, is_active=true, sku, provider, provider_ref, last_synced_at=now()`.
   - `type` remote **diabaikan**.
4. **Stale**: `UPDATE products SET is_active=false, last_synced_at=now()` untuk baris `provider='digiflazz'` yang tak ada di respons; tanpa DELETE.

## Batch upsert (mitigasi P6) — DITERAPKAN live ✅

REST `POST /rest/v1/products` per baris = 200+ request/hit → rate-limit & biaya. Batch via **satu RPC** (migration `0043_sync_digiflazz_products.sql`). Catatan vs draft:

- kolom `ON CONFLICT` update `selling_price` (bukan draft `price`).
- `selling_price_gold/platinum` fallback ke `selling_price` bila kosong (skema NOT NULL).
- `is_active` COALESCE default true.
- **Grant: hanya `service_role`** — anon/authenticated di-revoke (fungsi tulis).

```sql
CREATE OR REPLACE FUNCTION public.sync_digiflazz_products(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... -- definisi penuh di file migration
REVOKE ALL ON FUNCTION public.sync_digiflazz_products(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_digiflazz_products(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.sync_digiflazz_products(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_digiflazz_products(jsonb) TO service_role;
```

Worker cukup `POST /rest/v1/rpc/sync_digiflazz_products` isi `{"payload": [...]}` satu kali, dgn `Authorization: Bearer service_role`.

## Audit orphan (mitigasi P4)

- Setelah batch upsert, simpan daftar `brand` yang gagal resolve → `game_slug` null.
- Log & (opsional) insert ke tabel audit utk surveillance. Brands tidak-matched patut dipantau penuh, bukan skip diam-diam.

## Env worker (wrangler/secret)

| dummy.json / Digiflaz           | `products` column                            |
| ------------------------------- | -------------------------------------------- |
| `buyer_sku_code`                | `id` (PK upsert key)                         |
| `brand` → `games`               | `game_slug`                                  |
| `product_name`                  | `title`                                      |
| `price`                         | `selling_price`                              |
| `buyer_product_status`          | `is_active`                                  |
| `desc`                          | `description`                                |
| `start_cut_off` / `end_cut_off` | `start_cut_off` / `end_cut_off`              |
| `category`                      | `category_id` (resolve `product_categories`) |
| `type`                          | diabaikan                                    |

## Env worker (wrangler/secret)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DIGIFLAZZ_USERNAME`, `DIGIFLAZZ_API_KEY`.

**Keamanan**: `SUPABASE_SERVICE_ROLE_KEY` via `wrangler secret put`, tidak commit, tidak di `[vars]`/`.env`/wrangler.jsonc.

## STATUS — SELESAI 8 Agu 2026 ✅

- Worker diimplementasi: `src/index.ts` (Scheduled cron `*/10 * * * *` + fetch health `/__health` + manual `/__sync`), `src/md5.ts` (MD5 pure TS, WebCrypto tak punya MD5), `src/types.ts`.
- Alur: fetch price-list Digiflazz (`sign=md5(username+apikey+"pricelist")`) → resolve `brand`→`games.slug` (skip+log unmatched) → resolve `category`→`product_categories.id` → batch RPC `sync_digiflazz_products` satu kali → stale `PATCH products?id=in.(...)&provider=eq.digiflazz` set `is_active=false`.
- `wrangler.jsonc`: name `fs-digiflaz-sync-worker`, var `DIGIFLAZZ_BASE_URL`, cron 10 menit. Secret via `wrangler secret put` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIGIFLAZZ_USERNAME, DIGIFLAZZ_API_KEY) — **belum di-set**.
- **Verifikasi**: `tsc --noEmit` bersih; `wrangler deploy --dry-run` sukses (10.15 KiB); vitest 3/3 lulus (`test/sync.spec.ts` mapping+stale, `test/md5.spec.ts` known vectors).
- **Belum deploy**: set secret → `npm run deploy`. Status deploy = tandai selesai rilis.
