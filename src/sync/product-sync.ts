import { logger } from '../lib/logger';
import { config } from '../config';
import { digiflazzClient } from '../digiflazz/client';
import { supabaseClient } from '../supabase/client';
import { BRAND_ALIASES, brandToSlug } from './brand-aliases';
import type { DigiflazzPriceItem } from '../types/digiflazz';
import type { GameRow, CategoryRow, SyncRow, SyncResult } from '../types/sync';

export function buildGameLookup(games: GameRow[]): Map<string, GameRow> {
	const lookup = new Map<string, GameRow>();
	for (const game of games) {
		lookup.set(game.slug, game);
		if (game.name) lookup.set(brandToSlug(game.name), game);
		if (game.code) lookup.set(game.code.toLowerCase(), game);
	}
	return lookup;
}

export function buildCategoryLookup(categories: CategoryRow[]): Map<string, number> {
	const lookup = new Map<string, number>();
	for (const cat of categories) {
		lookup.set(cat.title.trim().toLowerCase(), cat.id);
		if (cat.slug) lookup.set(cat.slug.toLowerCase(), cat.id);
	}
	return lookup;
}

export function mapItemToSyncRow(item: DigiflazzPriceItem, game: GameRow, categoryId: number | null): SyncRow {
	const sku = item.buyer_sku_code;
	return {
		title: item.product_name,
		selling_price: item.price,
		game_slug: game.slug,
		brand: item.brand,
		category_id: categoryId,
		description: item.desc,
		start_cut_off: item.start_cut_off,
		end_cut_off: item.end_cut_off,
		is_active: item.buyer_product_status,
		sku,
		provider: 'digiflazz',
		provider_ref: sku,
	};
}

export async function runProductSync(): Promise<SyncResult> {
	logger.info('Starting product sync process...');
	const [priceList, games, categories] = await Promise.all([
		digiflazzClient.fetchPriceList(),
		supabaseClient.fetchGames(),
		supabaseClient.fetchProductCategories(),
	]);

	const gameLookup = buildGameLookup(games);
	const categoryLookup = buildCategoryLookup(categories);

	const rows: SyncRow[] = [];
	let skipped = 0;

	for (const item of priceList) {
		const sku = item.buyer_sku_code;
		if (!sku || sku === 'nan' || sku === 'undefined') {
			skipped++;
			logger.warn('skip invalid sku', { sku, product_name: item.product_name });
			continue;
		}

		const rawBrand = (item.brand || '').trim().toLowerCase();
		const rawCategory = (item.category || '').trim().toLowerCase();
		const aliasSlug = BRAND_ALIASES[rawBrand] || BRAND_ALIASES[rawCategory] || brandToSlug(item.brand);

		const game =
			gameLookup.get(aliasSlug) ||
			gameLookup.get(rawBrand) ||
			gameLookup.get(brandToSlug(item.category || '')) ||
			gameLookup.get(rawCategory);

		if (!game) {
			skipped++;
			logger.warn('skip unmatched brand', { brand: item.brand, sku: item.buyer_sku_code });
			continue;
		}

		const categoryId = categoryLookup.get(item.category?.trim().toLowerCase() || '') ?? null;
		rows.push(mapItemToSyncRow(item, game, categoryId));
	}

	if (rows.length > 0) {
		await supabaseClient.callSyncRpc(rows);
	}

	const stale = await supabaseClient.markStale(
		rows.map((r) => r.sku),
		config.sync.staleGuardRatio,
	);

	const result: SyncResult = {
		upserted: rows.length,
		skipped,
		stale: stale.marked,
	};

	logger.info('Product sync completed successfully', { ...result });
	return result;
}
