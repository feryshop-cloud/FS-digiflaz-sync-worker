# FS-digiflaz-sync-worker

Cloudflare Worker (cron-scheduled) yang menarik daftar harga produk dari REST API **Digiflazz**, lalu menyinkronkannya ke tabel `public.products` pada Supabase project **game-inventory** (`trviikqvvujcibplqwud`).

## Cara kerja

1. **Cron** memicu `scheduled` handler setiap **8 jam** (`0 */8 * * *`).
2. Tarik price-list dari Digiflazz (`POST /v1/price-list`, cmd `prepaid`).
3. Ambil daftar `games` dan `product_categories` dari Supabase untuk resolve game + kategori.
4. Map item Digiflazz → baris `products` (upsert by SKU via RPC `sync_digiflazz_products`).
5. **Mark stale**: non-aktifkan SKU `provider=digiflazz` yang tidak ada di respons terbaru (guard anti-reset via `STALE_GUARD_RATIO`).

## Endpoint HTTP

- `GET /__health` — healthcheck, mengembalikan `{"ok": true}`.
- `POST /__sync` — trigger manual (opsional). Butuh token: header `Authorization: Bearer <token>` **atau** `x-sync-token: <token>`. Tanpa token sah → `401`.

## Konfigurasi (`wrangler.jsonc`)

Vars:

| Var | Deskripsi |
|---|---|
| `DIGIFLAZZ_BASE_URL` | Base URL API Digiflazz (`https://api.digiflazz.com/v1`) |
| `DIGIFLAZZ_USE_DUMMY` | `true` → pakai `dummy.json` lokal (dev), `false` → API live |
| `SUPABASE_URL` | URL Supabase project |

Secrets (via `npx wrangler secret put` / `secret bulk` — **jangan commit**):

| Secret | Deskripsi |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Key service role Supabase (untuk tulis lewat RLS) |
| `DIGIFLAZZ_USERNAME` | Username akun Digiflazz |
| `DIGIFLAZZ_API_KEY` | API key Digiflazz |
| `SYNC_SECRET` | Token untuk guard `POST /__sync` (opsional) |

## Commands

```bash
npm install          # install deps
npm run dev          # wrangler dev lokal
npm run deploy       # wrangler deploy ke Cloudflare
npm run test         # vitest (mock fetch, tanpa hit API live)
npm run cf-typegen   # regenerate worker-configuration.d.ts dari wrangler.jsonc (jangan edit manual)
```

## Mapping Digiflazz → `public.products`

| Digiflazz | `products` column |
|---|---|
| `buyer_sku_code` | `id` (PK) + `sku` + `provider_ref` |
| `product_name` | `title` |
| `price` | `selling_price` |
| `buyer_product_status` | `is_active` |
| `desc` | `description` |
| `start_cut_off` / `end_cut_off` | `start_cut_off` / `end_cut_off` |
| brand → slug | `game_slug` |
| `category` | `category_id` (resolve ke `product_categories.id`) |
| — | `provider = 'digiflazz'`, `cost_price` default 0 |

Detail otoritatif: lihat `AGENTS.md` di repo ini.

## Deploy ke live (ganti dummy → real)

1. Isi `DIGIFLAZZ_USERNAME` + `DIGIFLAZZ_API_KEY` di `.dev.vars`.
2. `git` → set secret:
   ```bash
   npx wrangler secret put DIGIFLAZZ_USERNAME
   npx wrangler secret put DIGIFLAZZ_API_KEY
   ```
3. Ubah `DIGIFLAZZ_USE_DUMMY=false` di `wrangler.jsonc` (atau `--var`).
4. `npm run deploy`.

## Keamanan

- **Jangan commit** `SUPABASE_SERVICE_ROLE_KEY` — set via `wrangler secret put`, bukan `.dev.vars` yang ke-commit.
- Worker ini membutuhkan service role key untuk menulis ke `products` melewati RLS.
- Jangan menyimulasikan harga/stok untuk produksi — ambil dari API Digiflazz live.