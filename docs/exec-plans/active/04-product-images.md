# Plan 04 — Gambar Produk: Reuse Logo Game

Strategi representasi gambar untuk produk top-up (nominal diamond/CP). **KEPUTUSAN**: produk nominal memakai logo game-nya; kolom `products.logo`/`images` tetap NULL (single source of truth di `games`).

## Latar belakang

- **Digiflazz tidak mengirim gambar** — payload hanya teks (`product_name`, `brand`, `price`, `desc`, dst). Semua 55 produk hasil sync `logo`/`images` = NULL.
- UI sekarang punya fallback chain di beberapa tempat: `product.logo → product.images → game.logo → game.image → /placeholder.png`.
- **Gap**: `ProductSelection.tsx` (alur order) **tidak** fallback ke logo game — hanya `product.logo || product.images` → kartu produk tampil tanpa gambar.
- **Gap 2**: 2 slug produk tanpa `games` row → tak ada sumber gambar: `honor-of-kings`, `call-of-duty-mobile`.

## Strategi

Produk top-up (nominal) direpresentasikan oleh **logo/icon game**-nya. Single source of truth gambar = `games.image_url` / `games.logo` (S3). Tidak menduplikasi gambar ke `products`.

### Data yang tersedia

| slug                    | games row? | image_url / logo                              | status                     |
| ----------------------- | ---------- | --------------------------------------------- | -------------------------- |
| mobile-legends          | ✅         | `/games/image/mlbb-icon.webp`                 | ok                         |
| free-fire               | ✅         | `/games/image/ff-icon.webp`                   | ok                         |
| valorant                | ✅         | `/games/image/valorant-icon.webp` (logo null) | ok                         |
| roblox                  | ✅         | `/games/image/roblox-icon.webp`               | ok                         |
| genshin-impact          | ✅         | `/games/image/genshin-icon.webp`              | ok                         |
| pubg-mobile             | ✅         | `/games/image/pubg-icon.webp`                 | ok                         |
| **honor-of-kings**      | ❌         | —                                             | **butuh games row + icon** |
| **call-of-duty-mobile** | ❌         | —                                             | **butuh games row + icon** |

## Perubahan

### FS-Public

| File                                        | Perubahan                                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/order-config/[slug]/route.ts`  | Saat map produk: `logo: p.logo \|\| p.images \|\| liveGame.logo \|\| liveGame.image \|\| null`. Produk di order flow otomatis dapat logo game. |
| `src/components/order/ProductSelection.tsx` | Tak perlu ubah logika (render `product.logo \|\| product.images` tetap); produk kini membawa `logo` dari order-config.                         |
| `src/app/api/price-list/route.ts`           | Sudah fallback `product.logo \|\| product.images \|\| game.logo \|\| game.image` — konsisten, tak ubah.                                        |
| `src/app/price-list/page.tsx`               | Sudah fallback `product.logo \|\| selectedGame?.logo` — konsisten, tak ubah.                                                                   |
| `src/components/home/promo.tsx`             | `PromoProduct` pakai `game_image` (masih mock Unsplash) — di luar scope; tak disentuh.                                                         |

### game-inventori (data + skema pemilik)

| Kerja                | Detail                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tambah 2 `games` row | `honor-of-kings`, `call-of-duty-mobile`; `is_active=true`, `developers` diisi, `category_id` → `categories` (pola games existing, bukan product_categories), `sort_order` lanjut. |
| Upload icon ke S3    | `/games/image/codm-icon.webp` + `/games/logo/codm-icon.webp` (pakai `public/codm-icon.webp` yang sudah ada di FS-Public); HOK butuh file icon baru.                               |
| Cara                 | Via UI GameManager (settings → Master Game) di game-inventori, atau insert manual + upload S3.                                                                                    |

## Verifikasi

- `npm run lint` + `npx next build` (FS-Public).
- Manual: halaman `order/[slug]` — kartu produk tampil logo game; `price-list` konsisten.
- Produk HOK/CODM tampil logo setelah games row + icon terpasang.

## Status

- ✅ **Selesai 8 Agu 2026**:
  - `order-config/[slug]/route.ts`: fallback `logo: p.logo || p.images || liveGame.logo || liveGame.image || null` (commit worktree FS-Public).
  - Games row `honor-of-kings` + `call-of-duty-mobile` **di-insert live** (image `/games/image/hok-icon.webp`, `/games/image/codm-icon.webp`; logo `/games/logo/hok-icon.webp`, `/games/logo/codm-icon.webp`; category_id=1).
  - Icon HOK/CODM (`hok-icon.webp`, `codm-icon.webp`) sudah ada di `public/` + masuk `KNOWN_LOCAL_ICONS` → resolveStorageUrl memetakan ke public root (tanpa perlu upload S3).
  - FS-Public lint + build hijau; games row live diverifikasi via SQL.
