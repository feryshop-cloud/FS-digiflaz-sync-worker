# Plan 07 — Eksekusi & Verifikasi (Plan Akhir)

Dokumen final. Menjabarkan urutan eksekusi semua plan (01–05), status terkini, kriteria GO, dan verifikasi.

## Status eksekusi rilis ini (DIPERBARUI 8 Agu 2026)

| # | Migrasi / Kerja | Di plan | Status |
|---|---|---|
| 1 | Migration `0042_product_categories.sql` — seed+remap kategori, tabel + FK + kolom sync | 01 | ✅ live |
| 2 | Migration `0043_sync_digiflazz_products.sql` — RPC batch upsert | 05 | ✅ live |
| 3 | Migration `0044_promo_codes.sql` — tabel promo + RPC `validate_promo` | 06 | ✅ live |
| 3b | Migration `0045_fix_audit_trigger_nonuuid.sql` — blocker trigger audit | 06 | ✅ live |
| 4 | Storefront FS-Public: feature-flag harga | 02 | ✅ selesai (`ea096e1`) |
| 4b | Storefront FS-Public: schema/live/types/UI + grouping kategori | 03 | ✅ selesai (`478a80f`) |
| 5 | Gambar produk: reuse logo game + games row HOK/CODM | 04 | ✅ selesai |
| 6 | Worker cron sync (Cloudflare) | 05 | ✅ kode+test; **deploy pending** |
| 7 | Admin UI promo CRUD | 06 | ✅ selesai (`/dashboard/promo-codes`) |
| 7b | Storefront promo server-side + seed + kuota atomik | 06 | ✅ selesai |

> **PENTING — urut wajib**: 0042 seed kategori Sebelum attach FK (dilakukan). **0045 prerequisite** — tanpa fix, UPDATE/DELETE produk crash (temuan eksekusi).
>
> **Catatan eksekusi**: migrasi diterapkan via MCP `apply_migration`, bukan `supabase db push` (gagal krn drift history nama-file vs timestamp remote).

## Kriteria GO eksekusi

LangK 1–3b sudah terkenuhi (0042–0045, tdk tabrak 0041):

- [x] Nomor migrasi final (0042–0045) tdk tabrakan dgn 0041; tdk duplikat.
- [x] `product_categories` di-seed + remap produk lama Sebelum re-attach FK (P2).
- [x] RPC `sync_digiflazz_products` & `validate_promo` terdefinisi konkret.
- [x] Grant benar: `sync` → service_role only; `validate_promo` → anon/authenticated/service_role.
- [x] Advisor: warning `sync` & `audit_to_uuid` hilang; `validate_promo` tersisa (by design, output terkontrol).
- [x] Storefront feature-flag (02): lint bersih + build sukses (commit `ea096e1`).
- [x] **Langkah 4b, 5, 6, 7 selesai (8 Agu 2026)** — lihat tabel status di atas. Satu-satunya sisa: deploy worker cron (set secret + `npm run deploy`).

## Verifikasi

### `game-inventori` (skema) — DONE

- Migrasi 0042–0045 ter-apply live (via MCP). Nomor 0042–0045, bukan 0027.
- Advisor security direcek; `validate_promo` tersisa by design.

### Kode promo (Plan 06) — ✅ SELESAI

- [x] `promo_codes` ada + RLS admin via `is_admin()`; tanpa policy SELECT publik.
- [x] RPC `validate_promo` jalan utk semua kasus (not_found, min_order, quota, arsip, valid).
- [x] Storefront baca kode dari **DB** via RPC (bukan fallback hardcoded) — grep FERYSHOP10/NEWUSER = 0 hasil.
- [x] `/api/order` re-validate & re-hitung diskon server-side (R1).
- [x] Increment kuota atomik `used_count` (R3): reserve pre-insert via `RETURNING`, rowcount 0 → tolak; rollback bila insert gagal.
- [x] Admin UI CRUD promo (create/update/delete/list) + sidebar menu.

### `FS-Public` (storefront) — ✅ feature-flag DONE, sisa plan 03/04 pending

```powershell
npm run lint   # bersih (commit ea096e1)
npx next build # sukses 27/27 pages
```

### Worker sync — PENDING

- `npm run test` (vitest + `@cloudflare/vitest-pool-workers`); mock fetch.

## Checklist akhir (siap release)

- [x] Migration 0042–0045 jalan bersih; Advisor tanpa warning baru (semua warning tersisa by-design/legacy).
- [x] Storefront feature-flag (02): lint + build lulus (`ea096e1`).
- [x] Storefront schema/live/UI (03/04): lint + build lulus (`478a80f`, order-config fallback).
- [x] Gambar produk reuse logo (04): games row HOK/CODM live + icon resolve public root.
- [x] Worker (05): tsc bersih + dry-run deploy sukses + vitest 3/3.
- [x] Tidak ada `service_role_key` ke-commit (worker pakai `wrangler secret put`; tak ada di var/git).
- [x] Sync upsert by `id`, stale → `is_active=false`.
- [x] `promo_codes` migration + RLS admin + seed; storefront baca DB via RPC `validate_promo` (tanpa fallback hardcoded).
- [x] `api/order` re-validasi server-side + kuota atomik `used_count < quota` (reserve pre-insert, rowcount 0 → tolak; rollback bila insert gagal).
- [ ] **Deploy worker** (set secret + `npm run deploy`) — satu-satunya sisa rilis.
- [x] Semua known risks (P1–P7, R1–R8) dimitigasi / diterima.

## Rollback plan

- Migrasi: `supabase db reset` / pulih dari snapshot.
- Jika 0042 error: kembalikan FK ke `products_category_id_fkey → categories` (tabel lama masih ada).
- Promo: nonaktifkan `is_active=false` di DB (tabel ada, backend tak usah retool).

> Plan 07 = pintu keluar Dev → Prod. Migrasi utang 1–3b + feature-flag (4) beres; lanjut 4b–7.
