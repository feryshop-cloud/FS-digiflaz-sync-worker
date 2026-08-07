# AGENTS.md — FS-digiflaz-sync-worker

Cloudflare Worker (cron-scheduled) yang menarik daftar harga produk Digiflaz dari REST API pihak ketiga, lalu menyinkronkannya ke tabel `public.products` pada Supabase project game-inventory (`trviikqvvujcibplqwud`). Worker berjalan periodik via `Scheduled` handler.

Repro model: satu Worker (pola sama seperti `FS-email-worker`).

## Data source & target

- **Sumber**: REST API harga produk (format sama persis dengan `dummy.json` di root — array of item: `product_name`, `category`, `brand`, `type`, `seller_name`, `price`, `buyer_sku_code`, `buyer_product_status`, `seller_product_status`, `unlimited_stock`, `stock`, `multi`, `start_cut_off`, `end_cut_off`, `desc`). Lihat `dummy.json` untuk bentuk konkret data.
- **Target**: tabel `public.products` — definisi kolom otoritatif di `FS-Public/src/lib/db/schema.ts` (baris `products = pgTable(...)`) dan awal migrasi `game-inventori/supabase/migrations/`.

## Mapping Digiflaz → `public.products` (wajib, jangan tebak)

| dummy.json / Digiflaz                         | `products` column                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `buyer_sku_code`                              | `id` (PK, varchar SKU)                                                    |
| (harus diturunkan dari `buyer_sku_code`/game) | `game_slug`                                                               |
| `product_name`                                | `title`                                                                   |
| `price`                                       | `selling_price`                                                           |
| `buyer_product_status`                        | `is_active`                                                               |
| harga referensi (gold/platinum)               | `selling_price_gold`, `selling_price_platinum`                            |
| opsional                                      | `cost_price` (default `0`), `sku` = `id`, `is_gangguan` (default `false`) |
| `category` (dummy.json)                       | `category_id` — resolve ke `categories.id`                                |

`products.id` = SKU (`varchar(100)` PK). Untuk row yang sudah ada, sync harus **upsert by id** (INSERT … ON CONFLICT (id) DO UPDATE) supaya harga aktif diperbarui tanpa duplikat.

## Commands

| Command              | Apa                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------- |
| `npm run dev`        | `wrangler dev` lokal                                                                    |
| `npm run deploy`     | `wrangler deploy` ke Cloudflare                                                         |
| `npm run test`       | vitest                                                                                  |
| `npm run cf-typegen` | regenerate `worker-configuration.d.ts` dari `wrangler.jsonc` (**jangan diedit manual**) |

## Konfigurasi (`wrangler.jsonc`)

- Set `name` + `compatibility_date` sebelum deploy.
- Definisikan `Env` bindings + `[vars]` untuk `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`.
- Cron scheduling lewat `[triggers] cron` / `crons` field. Verifikasi sintaks di `wrangler.jsonc`.
- `tsconfig.json` > kumpulkan `src/**/*.ts`; `worker-configuration.d.ts` **generated**.

## Keamanan (kritikal)

- **Jangan pernah commit `service_role_key` ke siapa pun.** Worker ini butuh Service Role Key utk tulis ke `products` melewati RLS — simpan via `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`, **bukan** di `[vars]`/`.env`/wrangler.jsonc.
- Worker tidak punya filesystem: env di-set via `wrangler secret put` / `[vars]`, bukan `.env`.
- Format target adalah **remote Digiflazz** — hindari menyimulasikan harga/stok. Ambil dari REST API live.

## Runtime constraint

Cloudflare Workers = V8 isolate, bukan Node.js: tanpa filesystem, tanpa `dotenv`, tanpa modul Node.js bawaan kecuali di-bundle. Akses Supabase via global `fetch()` ke `SUPABASE_URL/rest/v1/products` + header `apikey` / `Authorization: Bearer <service_role>`:

- GET `…/products` utk ambil data lama, filter `game_slug`, `is_active`.
- POST/PATCH (REST) untuk insert/update; atau panggil RPC di `game-inventori/supabase/migrations/*` utk upsert massal.

## Testing

- vitest + `@cloudflare/vitest-pool-workers`; config `vitest.config.mts` refer `wrangler.jsonc`.
- Tes di `test/`; `test/env.d.ts` declare `cloudflare:test`.
- Lari satu: `npx vitest run test/sync.spec.ts`.
- Jangan bunuh endpoint live tiap tes; mock `fetch` untuk Digiflazz & Supabase.

## Style

- Indentasi: **tabs** (`.editorconfig`)
- Print width: **140** (`.prettierrc`)
- Single quotes, semicolon, trailing whitespace trim, final newline wajib.

## Pipeline kerja agent

1. Kosong awal — `dummy.json` sebagai referensi format target.
2. Init: pastikan `npm run cf-typegen` dijalankan ulang setelah ubah `wrangler.jsonc` (bindings baru mengubah `worker-configuration.d.ts`).
3. Worker: `Scheduled` handler + `fetch` handler untuk healthcheck (pola `FS-email-worker`).
4. Sinkronisasi upsert → test (mock live) → `npm run lint`; `npm run build` (PowerShell: tanpa `&&`).
