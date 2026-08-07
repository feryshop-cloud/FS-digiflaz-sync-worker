# Plan 02 — Feature-flag harga member (`pricing.member_price`) — ✅ SELESAI

Tujuan: satu harga publik (`selling_price`), harga per-role (gold/platinum) hanya aktif bila flag **ON**. Kolom tetap di DB → bisa dibalik. Flag di-hardcode **false** (default).

> **Status**: ✅ SELESAI. Commit `ea096e1` (FS-Public). Lint bersih, `next build` sukses 27/27 pages.

## Konfigurasi

- Flag = konstanta hardcode `false` di kode storefront (FS-Public), **bukan** dari remote settings.
- Default **false** (OFF) → semua harga berdasar `selling_price`. Ubah konstanta menjadi `true` utk membalik.
- **Lokasi: `src/lib/pricing.ts`** — file baru bebas Node deps (client-safe). `src/lib/db/live-adapter.ts` re-export utk pemakaian server. Alasan: live-adapter import `logger` → `node:async_hooks`, memicu Turbopack gagal jika ditarik ke client bundle.

```ts
// src/lib/pricing.ts
export const MEMBER_PRICE_FLAG = false;

export const getPriceByRole = (
	p: { selling_price: number; selling_price_gold?: number | null; selling_price_platinum?: number | null },
	role?: string | null,
): number => {
	if (!MEMBER_PRICE_FLAG) return Number(p.selling_price ?? 0);
	if (role === 'gold') return Number(p.selling_price_gold ?? p.selling_price);
	if (role === 'platinum') return Number(p.selling_price_platinum ?? p.selling_price);
	return Number(p.selling_price ?? 0);
};
```

- Getter mengikuti `MEMBER_PRICE_FLAG`; konsumen panggil getter, bukan cek role manual.

## Storefront (FS-Public) — 6 file konsumen

Impor `MEMBER_PRICE_FLAG` / `getPriceByRole` dari `src/lib/pricing` (client) / `src/lib/db/live-adapter` (server); hapus definisi lokal duplikat.

| File                                              | Branch role saat ini                       | Tindakan ✅                                                                  |
| ------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/lib/pricing.ts`                              | — (baru)                                   | `MEMBER_PRICE_FLAG=false` + `getPriceByRole`                                 |
| `src/components/order/ProductSelection.tsx:17-22` | `getPriceByRole` lokal (tanpa flag)        | Definis lokal dihapus; import `getPriceByRole` dari pricing                  |
| `src/components/home/promo.tsx:54-58`             | `getPriceByRole` lokal (tanpa flag)        | Definis lokal dihapus; import `getPriceByRole` dari pricing                  |
| `src/app/order/[slug]/page.tsx:202-209`           | inline `role === "gold"/"platinum"`        | `baseProductPrice` pakai `getPriceByRole` (useMemo → IIFE utk compiler lint) |
| `src/app/price-list/page.tsx:192-197`             | render kolom gold/platinum statis          | Kolom tier disembunyikan saat flag false                                     |
| `src/app/api/price-list/route.ts:38-39`           | selalu kirim `selling_price_gold/platinum` | Field tier tak disertakan saat flag false                                    |

### Catatan spesifik

- **price-list page** = Client Component → import langsung `@/lib/pricing`.
- **price-list API** (`api/price-list/route.ts`) serarkan dua kolom hanya bila flag true; bila false kirim `selling_price` saja.
- **Type** `src/types/index.ts:15` `selling_price_gold: number` — dibiarkan (optionalisasi getter, bukan type; type non-optional pre-existing).

## Verifikasi — ✅ Hasil

- `npm run lint` bersih (0 error).
- `npx next build` sukses: "Compiled successfully", TypeScript pass, static pages 27/27.
- Manual: saat flag `false`, order/[slug], home/promo & price-list tampilkan `selling_price` tunggal; kolom Gold/Platinum di price-list hilang; `api/price-list` respons tanpa `selling_price_gold/platinum`. Toggle `MEMBER_PRICE_FLAG=true` → harga tier + kolom muncul kembali.

> Tetap perbarui gold/platinum tiap sync (mitigasi P3) walau flag false — harga tier fresh bila dibalik ON.
