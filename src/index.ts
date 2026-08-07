import { md5hex } from './md5';
import type { DigiflazzPriceItem, SyncRow } from './types';
import dummyData from '../dummy.json';

interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
	DIGIFLAZZ_USERNAME: string;
	DIGIFLAZZ_API_KEY: string;
	DIGIFLAZZ_BASE_URL: string;
	DIGIFLAZZ_USE_DUMMY: string;
	SYNC_SECRET?: string;
	STALE_GUARD_RATIO?: string;
}

const SUPA_HEADERS = (env: Env) => ({
	apikey: env.SUPABASE_SERVICE_ROLE_KEY,
	Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
	'Content-Type': 'application/json',
});

async function fetchDigiflazzPriceList(env: Env): Promise<DigiflazzPriceItem[]> {
	// Feature-flag: pakai dummy.json lokal (tanpa tembak API Digiflazz) utk dev/test.
	if (env.DIGIFLAZZ_USE_DUMMY === 'true' || env.DIGIFLAZZ_USE_DUMMY === '1') {
		console.log('sync: DIGIFLAZZ_USE_DUMMY=true, using local dummy.json');
		if (Array.isArray(dummyData)) return dummyData as DigiflazzPriceItem[];
		return (dummyData as { data?: DigiflazzPriceItem[] }).data ?? [];
	}
	const base = env.DIGIFLAZZ_BASE_URL || 'https://api.digiflazz.com/v1';
	const sign = md5hex(env.DIGIFLAZZ_USERNAME + env.DIGIFLAZZ_API_KEY + 'pricelist');
	const response = await fetch(`${base}/price-list`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			cmd: 'prepaid',
			username: env.DIGIFLAZZ_USERNAME,
			sign,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Digiflazz price-list HTTP ${response.status}: ${body}`);
	}
	const json = (await response.json()) as { data?: DigiflazzPriceItem[]; rc?: string; message?: string };
	if (json.rc && json.rc !== '00') {
		throw new Error(`Digiflazz price-list rc=${json.rc}: ${json.message}`);
	}
	if (!Array.isArray(json.data)) {
		throw new Error('Digiflazz price-list response missing data array');
	}
	return json.data;
}

interface GameRow {
	slug: string;
	name?: string | null;
}

interface CategoryRow {
	id: number;
	title: string;
	slug?: string | null;
}

async function fetchGames(env: Env): Promise<GameRow[]> {
	const response = await fetch(`${env.SUPABASE_URL}/rest/v1/games?select=slug,name`, { headers: SUPA_HEADERS(env), cache: 'no-store' });
	if (!response.ok) throw new Error(`games fetch HTTP ${response.status}`);
	return (await response.json()) as GameRow[];
}

async function fetchProductCategories(env: Env): Promise<CategoryRow[]> {
	const response = await fetch(`${env.SUPABASE_URL}/rest/v1/product_categories?select=id,title,slug`, {
		headers: SUPA_HEADERS(env),
		cache: 'no-store',
	});
	if (!response.ok) throw new Error(`product_categories fetch HTTP ${response.status}`);
	return (await response.json()) as CategoryRow[];
}

/** Normalisasi brand Digiflazz → slug game (lowercase, spasi → dash). */
function brandToSlug(brand: string): string {
	return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Build lookup: game slug → game, dan normalized name → game. */
function buildGameLookup(games: GameRow[]): Map<string, GameRow> {
	const lookup = new Map<string, GameRow>();
	for (const game of games) {
		lookup.set(game.slug, game);
		if (game.name) lookup.set(brandToSlug(game.name), game);
	}
	return lookup;
}

function buildCategoryLookup(categories: CategoryRow[]): Map<string, number> {
	const lookup = new Map<string, number>();
	for (const cat of categories) {
		lookup.set(cat.title.trim().toLowerCase(), cat.id);
		if (cat.slug) lookup.set(cat.slug.toLowerCase(), cat.id);
	}
	return lookup;
}

function mapItemToSyncRow(item: DigiflazzPriceItem, game: GameRow, categoryId: number | null): SyncRow {
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

async function callSyncRpc(env: Env, rows: SyncRow[]): Promise<void> {
	const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/sync_digiflazz_products`, {
		method: 'POST',
		headers: SUPA_HEADERS(env),
		body: JSON.stringify({ payload: rows }),
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`sync RPC HTTP ${response.status}: ${body}`);
	}
}

/**
 * Guard: jangan mark-stale semuanya saat data upstream kosong/parsial.
 * Return { marked, aborted: boolean }. Abaikan bila syncedIds kosong atau
 * batch yang disinkronkan jauh lebih kecil dari baseline existing (upstream
 * glitch/downstream reset) supaya tidak mematikan toko via NULL-deactivate.
 */
async function markStale(env: Env, syncedSkus: string[]): Promise<{ marked: number; aborted: boolean }> {
	if (syncedSkus.length === 0) return { marked: 0, aborted: true };
	const response = await fetch(`${env.SUPABASE_URL}/rest/v1/products?select=sku&provider=eq.digiflazz&sku=not.is.null`, {
		headers: SUPA_HEADERS(env),
		cache: 'no-store',
	});
	if (!response.ok) throw new Error(`products fetch HTTP ${response.status}`);
	const rows = (await response.json()) as { sku: string }[];
	const existingSkus = rows.map((r) => r.sku);
	if (existingSkus.length === 0) return { marked: 0, aborted: true };
	const ratio = Number(env.STALE_GUARD_RATIO) || 0.3;
	if (syncedSkus.length / existingSkus.length < ratio) {
		console.warn(`sync: stale-guard abort (synced ${syncedSkus.length}/${existingSkus.length} < ${ratio}) — upstream likely partial`);
		return { marked: 0, aborted: true };
	}
	const current = new Set(existingSkus);
	const synced = new Set(syncedSkus);
	const staleSkus = existingSkus.filter((sku) => !synced.has(sku));
	if (staleSkus.length === 0) return { marked: 0, aborted: false };

	// PATCH bulk via not.in; pecah per 100 sku agar URL tidak kepanjangan.
	const CHUNK = 100;
	for (let i = 0; i < staleSkus.length; i += CHUNK) {
		const chunk = staleSkus.slice(i, i + CHUNK);
		const filter = chunk.map((sku) => encodeURIComponent(sku)).join(',');
		const patch = await fetch(`${env.SUPABASE_URL}/rest/v1/products?sku=in.(${filter})&provider=eq.digiflazz`, {
			method: 'PATCH',
			headers: SUPA_HEADERS(env),
			body: JSON.stringify({ is_active: false, last_synced_at: new Date().toISOString() }),
		});
		if (!patch.ok) {
			const body = await patch.text();
			throw new Error(`stale PATCH HTTP ${patch.status}: ${body}`);
		}
	}
	return { marked: staleSkus.length, aborted: false };
}

export async function runSync(env: Env): Promise<{ upserted: number; skipped: number; stale: number }> {
	const [priceList, games, categories] = await Promise.all([fetchDigiflazzPriceList(env), fetchGames(env), fetchProductCategories(env)]);

	const gameLookup = buildGameLookup(games);
	const categoryLookup = buildCategoryLookup(categories);

	const rows: SyncRow[] = [];
	let skipped = 0;
	for (const item of priceList) {
		const sku = item.buyer_sku_code;
		if (!sku || sku === 'nan' || sku === 'undefined') {
			skipped++;
			console.warn(`sync: skip invalid sku "${sku}" (${item.product_name})`);
			continue;
		}
		const slug = brandToSlug(item.brand);
		const game = gameLookup.get(slug) || gameLookup.get(brandToSlug(item.category)) || gameLookup.get(item.brand.trim().toLowerCase());
		if (!game) {
			skipped++;
			console.warn(`sync: skip unmatched brand "${item.brand}" (sku ${item.buyer_sku_code})`);
			continue;
		}
		const categoryId = categoryLookup.get(item.category?.trim().toLowerCase() || '') ?? null;
		rows.push(mapItemToSyncRow(item, game, categoryId));
	}

	if (rows.length > 0) {
		await callSyncRpc(env, rows);
	}

	const stale = await markStale(
		env,
		rows.map((r) => r.sku),
	);
	return { upserted: rows.length, skipped, stale: stale.marked };
}

export default {
	async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			runSync(env)
				.then((result) => {
					console.log(`sync ok`, JSON.stringify(result));
				})
				.catch((error) => {
					console.error(`sync failed`, error);
				}),
		);
	},
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/__health') {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		if (url.pathname === '/__sync' && request.method === 'POST') {
			// Auth wajib: tanpa token sah, jangan tarik prices list + tulis DB pakai service-role.
			const expected = env.SYNC_SECRET;
			const supplied = request.headers.get('Authorization')?.trim();
			const suppliedBearer = supplied?.startsWith('Bearer ') ? supplied.slice(7).trim() : null;
			const viaHeader = request.headers.get('x-sync-token')?.trim();
			const token = suppliedBearer || viaHeader;
			if (!expected || token !== expected) {
				return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			console.log('sync: manual trigger via /__sync');
			ctx.waitUntil(
				runSync(env)
					.then((result) => console.log(`sync ok`, JSON.stringify(result)))
					.catch((error) => console.error(`sync failed`, error)),
			);
			return new Response(JSON.stringify({ ok: true, accepted: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
