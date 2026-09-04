import { describe, it, expect } from 'bun:test';
import { buildGameLookup, buildCategoryLookup, mapItemToSyncRow } from '../src/sync/product-sync';
import { BRAND_ALIASES, brandToSlug } from '../src/sync/brand-aliases';
import type { DigiflazzPriceItem } from '../src/types/digiflazz';
import type { GameRow, CategoryRow } from '../src/types/sync';

describe('Product Sync Helpers', () => {
	it('normalizes brand strings to slugs correctly', () => {
		expect(brandToSlug('Call Of Duty Mobile')).toBe('call-of-duty-mobile');
		expect(brandToSlug(' Mobile Legends: Bang Bang ')).toBe('mobile-legends-bang-bang');
		expect(brandToSlug('Valorant')).toBe('valorant');
	});

	it('resolves aliases properly', () => {
		expect(BRAND_ALIASES['mlbb']).toBe('mobile-legends');
		expect(BRAND_ALIASES['hok']).toBe('honor-of-kings');
		expect(BRAND_ALIASES['codm']).toBe('call-of-duty-mobile');
	});

	it('builds lookup maps for games and categories', () => {
		const games: GameRow[] = [
			{ slug: 'mobile-legends', name: 'Mobile Legends: Bang Bang', code: 'MLBB' },
			{ slug: 'valorant', name: 'Valorant', code: 'VALO' },
		];

		const categories: CategoryRow[] = [
			{ id: 1, title: 'Diamonds', slug: 'diamonds' },
			{ id: 2, title: 'Points', slug: 'points' },
		];

		const gameLookup = buildGameLookup(games);
		const catLookup = buildCategoryLookup(categories);

		expect(gameLookup.get('mobile-legends')?.slug).toBe('mobile-legends');
		expect(gameLookup.get('mlbb')?.slug).toBe('mobile-legends');
		expect(catLookup.get('diamonds')).toBe(1);
		expect(catLookup.get('points')).toBe(2);
	});

	it('maps Digiflazz price item to sync row', () => {
		const item: DigiflazzPriceItem = {
			product_name: '86 Diamonds',
			category: 'Diamonds',
			brand: 'Mobile Legends',
			type: 'General',
			seller_name: 'Official',
			price: 19500,
			buyer_sku_code: 'MLBB-86',
			buyer_product_status: true,
			seller_product_status: true,
			unlimited_stock: true,
			stock: 100,
			multi: true,
			start_cut_off: '23:50',
			end_cut_off: '00:10',
			desc: 'Fast delivery',
		};

		const game: GameRow = { slug: 'mobile-legends', name: 'Mobile Legends' };
		const row = mapItemToSyncRow(item, game, 1);

		expect(row.title).toBe('86 Diamonds');
		expect(row.selling_price).toBe(19500);
		expect(row.game_slug).toBe('mobile-legends');
		expect(row.category_id).toBe(1);
		expect(row.sku).toBe('MLBB-86');
		expect(row.provider).toBe('digiflazz');
		expect(row.is_active).toBe(true);
	});
});
