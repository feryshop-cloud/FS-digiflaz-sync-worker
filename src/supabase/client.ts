import { config } from '../config';
import { logger } from '../lib/logger';
import type { GameRow, CategoryRow, SyncRow } from '../types/sync';
import type { DigiflazzTransactionRecord } from '../types/transaction';

export class SupabaseClient {
	private url: string;
	private key: string;

	constructor() {
		this.url = config.supabase.url;
		this.key = config.supabase.serviceRoleKey;
	}

	private headers(): Record<string, string> {
		return {
			apikey: this.key,
			Authorization: `Bearer ${this.key}`,
			'Content-Type': 'application/json',
		};
	}

	async fetchGames(): Promise<GameRow[]> {
		if (!this.url || !this.key) {
			logger.warn('Supabase URL or Key not set, returning empty games');
			return [];
		}
		const response = await fetch(`${this.url}/rest/v1/games?select=slug,name,code`, {
			headers: this.headers(),
			cache: 'no-store',
		});
		if (!response.ok) throw new Error(`games fetch HTTP ${response.status}`);
		return (await response.json()) as GameRow[];
	}

	async fetchProductCategories(): Promise<CategoryRow[]> {
		if (!this.url || !this.key) {
			logger.warn('Supabase URL or Key not set, returning empty categories');
			return [];
		}
		const response = await fetch(`${this.url}/rest/v1/product_categories?select=id,title,slug`, {
			headers: this.headers(),
			cache: 'no-store',
		});
		if (!response.ok) throw new Error(`product_categories fetch HTTP ${response.status}`);
		return (await response.json()) as CategoryRow[];
	}

	async callSyncRpc(rows: SyncRow[]): Promise<void> {
		if (!this.url || !this.key) return;
		const response = await fetch(`${this.url}/rest/v1/rpc/sync_digiflazz_products`, {
			method: 'POST',
			headers: this.headers(),
			body: JSON.stringify({ payload: rows }),
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`sync RPC HTTP ${response.status}: ${body}`);
		}
	}

	async markStale(syncedSkus: string[], ratio: number): Promise<{ marked: number; aborted: boolean }> {
		if (syncedSkus.length === 0) return { marked: 0, aborted: true };
		if (!this.url || !this.key) return { marked: 0, aborted: false };

		const response = await fetch(`${this.url}/rest/v1/products?select=sku&provider=eq.digiflazz&sku=not.is.null`, {
			headers: this.headers(),
			cache: 'no-store',
		});
		if (!response.ok) throw new Error(`products fetch HTTP ${response.status}`);
		const rows = (await response.json()) as { sku: string }[];
		const existingSkus = rows.map((r) => r.sku);
		if (existingSkus.length === 0) return { marked: 0, aborted: true };

		if (syncedSkus.length / existingSkus.length < ratio) {
			logger.warn('stale-guard abort — upstream likely partial', {
				synced: syncedSkus.length,
				existing: existingSkus.length,
				ratio,
			});
			return { marked: 0, aborted: true };
		}

		const synced = new Set(syncedSkus);
		const staleSkus = existingSkus.filter((sku) => !synced.has(sku));
		if (staleSkus.length === 0) return { marked: 0, aborted: false };

		const CHUNK = 100;
		for (let i = 0; i < staleSkus.length; i += CHUNK) {
			const chunk = staleSkus.slice(i, i + CHUNK);
			const filter = chunk.map((sku) => encodeURIComponent(sku)).join(',');
			const patch = await fetch(`${this.url}/rest/v1/products?sku=in.(${filter})&provider=eq.digiflazz`, {
				method: 'PATCH',
				headers: this.headers(),
				body: JSON.stringify({ is_active: false, last_synced_at: new Date().toISOString() }),
			});
			if (!patch.ok) {
				const body = await patch.text();
				throw new Error(`stale PATCH HTTP ${patch.status}: ${body}`);
			}
		}
		return { marked: staleSkus.length, aborted: false };
	}

	async insertTransaction(tx: DigiflazzTransactionRecord): Promise<void> {
		if (!this.url || !this.key) {
			logger.info('Supabase credentials not configured, skipping DB insert', { refId: tx.ref_id });
			return;
		}
		const response = await fetch(`${this.url}/rest/v1/digiflazz_transactions`, {
			method: 'POST',
			headers: {
				...this.headers(),
				Prefer: 'return=minimal',
			},
			body: JSON.stringify(tx),
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`insertTransaction HTTP ${response.status}: ${body}`);
		}
	}

	async updateTransaction(refId: string, updates: Partial<DigiflazzTransactionRecord>): Promise<void> {
		if (!this.url || !this.key) return;
		const response = await fetch(`${this.url}/rest/v1/digiflazz_transactions?ref_id=eq.${encodeURIComponent(refId)}`, {
			method: 'PATCH',
			headers: this.headers(),
			body: JSON.stringify({
				...updates,
				updated_at: new Date().toISOString(),
			}),
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`updateTransaction HTTP ${response.status}: ${body}`);
		}
	}

	async getPendingTransactions(limit = 20): Promise<DigiflazzTransactionRecord[]> {
		if (!this.url || !this.key) return [];
		const response = await fetch(`${this.url}/rest/v1/digiflazz_transactions?status=eq.pending&order=created_at.asc&limit=${limit}`, {
			headers: this.headers(),
			cache: 'no-store',
		});
		if (!response.ok) throw new Error(`getPendingTransactions HTTP ${response.status}`);
		return (await response.json()) as DigiflazzTransactionRecord[];
	}

	async updateOrderStatus(orderId: string, status: { fulfillmentStatus?: string; serialNumber?: string }): Promise<void> {
		if (!this.url || !this.key) return;
		const patchPayload: Record<string, unknown> = {};
		if (status.fulfillmentStatus) patchPayload.fulfillment_status = status.fulfillmentStatus;
		if (status.serialNumber) patchPayload.serial_number = status.serialNumber;

		const response = await fetch(`${this.url}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}`, {
			method: 'PATCH',
			headers: this.headers(),
			body: JSON.stringify(patchPayload),
		});
		if (!response.ok) {
			const body = await response.text();
			throw new Error(`updateOrderStatus HTTP ${response.status}: ${body}`);
		}
	}
}

export const supabaseClient = new SupabaseClient();
