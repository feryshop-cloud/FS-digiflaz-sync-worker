import { digiflazzClient } from '../digiflazz/client';
import { logger } from '../lib/logger';
import { digiflazzBalanceDeposit } from '../lib/metrics';

interface CachedBalance {
	deposit: number;
	timestamp: number;
}

export class BalanceService {
	private cached: CachedBalance | null = null;
	private ttlMs: number;

	constructor(ttlSeconds = 60) {
		this.ttlMs = ttlSeconds * 1000;
	}

	/**
	 * Mengambil saldo deposit terkini, menggunakan cache memory jika masih segar.
	 * @param forceRefresh jika true, abaikan cache dan ambil langsung dari Digiflazz
	 */
	async getBalance(forceRefresh = false): Promise<{ deposit: number; cached: boolean; lastChecked: string }> {
		const now = Date.now();
		if (!forceRefresh && this.cached && now - this.cached.timestamp < this.ttlMs) {
			return {
				deposit: this.cached.deposit,
				cached: true,
				lastChecked: new Date(this.cached.timestamp).toISOString(),
			};
		}

		try {
			const res = await digiflazzClient.checkBalance();
			this.cached = {
				deposit: res.deposit,
				timestamp: now,
			};
			digiflazzBalanceDeposit.set(res.deposit);
			return {
				deposit: res.deposit,
				cached: false,
				lastChecked: new Date(now).toISOString(),
			};
		} catch (error) {
			logger.error('Failed to check Digiflazz balance', { error });
			if (this.cached) {
				logger.warn('Using stale cached balance due to API error', { deposit: this.cached.deposit });
				return {
					deposit: this.cached.deposit,
					cached: true,
					lastChecked: new Date(this.cached.timestamp).toISOString(),
				};
			}
			throw error;
		}
	}

	/**
	 * Update deposit cache setelah transaksi sukses.
	 */
	updateCachedDeposit(newDeposit: number): void {
		this.cached = {
			deposit: newDeposit,
			timestamp: Date.now(),
		};
		digiflazzBalanceDeposit.set(newDeposit);
	}
}

export const balanceService = new BalanceService();
