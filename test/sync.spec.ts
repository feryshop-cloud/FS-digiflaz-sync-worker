import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker, { runSync } from '../src/index';

const env = {
	SUPABASE_URL: 'https://mock.supabase.co',
	SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
	DIGIFLAZZ_USERNAME: 'test-user',
	DIGIFLAZZ_API_KEY: 'test-key',
	DIGIFLAZZ_BASE_URL: 'https://mock.digiflazz.com/v1',
};

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

const priceList = {
	data: [
		{
			product_name: '31 CP',
			category: 'Top Up Games',
			brand: 'call-of-duty-mobile',
			type: 'call-of-duty-mobile',
			seller_name: 'Feryshop',
			price: 5000,
			buyer_sku_code: 'CODM-31',
			buyer_product_status: true,
			seller_product_status: true,
			unlimited_stock: true,
			stock: 0,
			multi: true,
			start_cut_off: '23:45',
			end_cut_off: '00:15',
			desc: '31 CP',
		},
		{
			product_name: '70 Diamonds',
			category: '',
			brand: 'Mobile Legends',
			type: 'mobile-legends',
			seller_name: 'Feryshop',
			price: 15000,
			buyer_sku_code: 'ML-70',
			buyer_product_status: true,
			seller_product_status: true,
			unlimited_stock: true,
			stock: 0,
			multi: true,
			start_cut_off: '00:00',
			end_cut_off: '23:59',
			desc: '70 Diamonds',
		},
	],
};

function fetchMock(url: string | URL | Request, init?: RequestInit): Promise<Response> {
	const u = String(url);
	if (u.includes('/price-list')) return Promise.resolve(jsonResponse(priceList));
	if (u.includes('/games?')) {
		return Promise.resolve(
			jsonResponse([
				{ slug: 'call-of-duty-mobile', name: 'Call of Duty Mobile' },
				{ slug: 'mobile-legends', name: 'Mobile Legends' },
			]),
		);
	}
	if (u.includes('/product_categories?')) {
		return Promise.resolve(jsonResponse([{ id: 1, title: 'Top Up Games', slug: 'top-up-games' }]));
	}
	if (u.includes('/rpc/sync_digiflazz_products')) {
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		expect(body).toBeTruthy();
		expect(Array.isArray(body.payload)).toBe(true);
		expect(body.payload.length).toBe(2);
		expect(body.payload[0]).toMatchObject({ id: 'CODM-31', game_slug: 'call-of-duty-mobile', brand: 'call-of-duty-mobile', category_id: 1, selling_price: 5000 });
		expect(body.payload[1]).toMatchObject({ id: 'ML-70', game_slug: 'mobile-legends', brand: 'Mobile Legends', category_id: null, selling_price: 15000 });
		return Promise.resolve(jsonResponse({}));
	}
	if (u.includes('/products?select=id')) {
		return Promise.resolve(jsonResponse([{ id: 'CODM-31' }, { id: 'OLD-STALE' }]));
	}
	if (u.includes('/products?id=in.')) {
		const body = init?.body ? JSON.parse(String(init.body)) : null;
		expect(body).toMatchObject({ is_active: false });
		return Promise.resolve(jsonResponse({}));
	}
	return Promise.resolve(jsonResponse({}, 404));
}

describe('runSync', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('maps Digiflazz price list to RPC payload and marks stale', async () => {
		const result = await runSync(env);
		expect(result).toEqual({ upserted: 2, skipped: 0, stale: 1 });
	});

	it('skips brands not present in games', async () => {
		const customFetch: typeof fetch = (url, init) => {
			const u = String(url);
			if (u.includes('/price-list')) {
				return Promise.resolve(
					jsonResponse({
						data: [{ ...priceList.data[0], brand: 'Unknown Game', buyer_sku_code: 'UNK-1' }],
					}),
				);
			}
			return fetchMock(url, init);
		};
		vi.stubGlobal('fetch', customFetch);
		const result = await runSync(env);
		expect(result.upserted).toBe(0);
		expect(result.skipped).toBe(1);
	});

	it('guards markStale when price list is empty so nothing is deactivated', async () => {
		const customFetch: typeof fetch = (url, init) => {
			const u = String(url);
			if (u.includes('/price-list')) return Promise.resolve(jsonResponse({ data: [] }));
			return fetchMock(url, init);
		};
		vi.stubGlobal('fetch', customFetch);
		const result = await runSync(env);
		expect(result.upserted).toBe(0);
		expect(result.stale).toBe(0);
	});

	it('aborts stale-marking when upstream batch is far smaller than existing (partial/glitch)', async () => {
		let patched = false;
		const manyDb = Array.from({ length: 10 }, (_, i) => ({ id: `STALE-${i}` }));
		const customFetch: typeof fetch = (url, init) => {
			const u = String(url);
			if (u.includes('/products?select=id')) {
				return Promise.resolve(jsonResponse(manyDb)); // 10 produk di DB, synced=2 → 0.2 < 0.9
			}
			if (u.includes('/products?id=in.')) {
				patched = true;
				return Promise.resolve(jsonResponse({}));
			}
			return fetchMock(url, init);
		};
		vi.stubGlobal('fetch', customFetch);
		const result = await runSync({ ...env, STALE_GUARD_RATIO: '0.9' });
		expect(patched).toBe(false);
		expect(result.stale).toBe(0);
	});
});

describe('fetch handler auth on /__sync', () => {
	beforeEach(() => vi.stubGlobal('fetch', fetchMock));
	afterEach(() => vi.unstubAllGlobals());

	it('returns 401 when no sync secret is configured', async () => {
		const res = await worker.fetch(new Request('http://worker/__sync', { method: 'POST' }), env);
		expect(res.status).toBe(401);
	});

	it('returns 401 when token is missing or wrong', async () => {
		const authed = { ...env, SYNC_SECRET: 's3cret' };
		const noToken = await worker.fetch(new Request('http://worker/__sync', { method: 'POST' }), authed);
		expect(noToken.status).toBe(401);
		const wrongHeader = await worker.fetch(
			new Request('http://worker/__sync', { method: 'POST', headers: { Authorization: 'Bearer wrong' } }),
			authed,
		);
		expect(wrongHeader.status).toBe(401);
	});

	it('accepts valid Bearer token', async () => {
		const ctx = { waitUntil: vi.fn() };
		const res = await worker.fetch(
			new Request('http://worker/__sync', { method: 'POST', headers: { Authorization: 'Bearer s3cret' } }),
			{ ...env, SYNC_SECRET: 's3cret' },
			ctx as unknown as ExecutionContext,
		);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ ok: true, accepted: true });
		expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
	});
});
