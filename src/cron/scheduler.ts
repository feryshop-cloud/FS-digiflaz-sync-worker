import { runProductSync } from '../sync/product-sync';
import { reconcilePendingTransactions } from './reconciler';
import { balanceService } from '../balance/balance-service';
import { logger } from '../lib/logger';

export class CronScheduler {
	private syncInterval: ReturnType<typeof setInterval> | null = null;
	private reconcilerInterval: ReturnType<typeof setInterval> | null = null;
	private balanceInterval: ReturnType<typeof setInterval> | null = null;
	private initialSyncTimeout: ReturnType<typeof setTimeout> | null = null;
	private initialReconcileTimeout: ReturnType<typeof setTimeout> | null = null;
	private initialBalanceTimeout: ReturnType<typeof setTimeout> | null = null;

	start(): void {
		logger.info('Starting internal background scheduler...');

		// Initial runs shortly after startup to immediately populate metrics and sync state
		this.initialBalanceTimeout = setTimeout(() => {
			balanceService.getBalance(true).catch((err) => logger.error('Initial balance check failed', { error: err }));
		}, 3000);

		this.initialSyncTimeout = setTimeout(() => {
			logger.info('Initial product sync triggered on startup');
			runProductSync().catch((err) => logger.error('Initial sync failed', { error: err }));
		}, 10000);

		this.initialReconcileTimeout = setTimeout(() => {
			reconcilePendingTransactions().catch((err) => logger.error('Initial reconciler failed', { error: err }));
		}, 15000);

		// 1. Sinkronisasi produk setiap 8 jam (28.800.000 ms)
		const EIGHT_HOURS = 8 * 60 * 60 * 1000;
		this.syncInterval = setInterval(() => {
			logger.info('Scheduled product sync triggered');
			runProductSync().catch((err) => logger.error('Scheduled sync failed', { error: err }));
		}, EIGHT_HOURS);

		// 2. Reconcile transaksi pending setiap 10 menit (600.000 ms) sebagai safety fallback jika webhook terlewat
		const TEN_MINUTES = 10 * 60 * 1000;
		this.reconcilerInterval = setInterval(() => {
			reconcilePendingTransactions().catch((err) => logger.error('Scheduled reconciler failed', { error: err }));
		}, TEN_MINUTES);

		// 3. Cek saldo Digiflazz setiap 30 menit untuk refresh cache & alert jika menipis
		const THIRTY_MINUTES = 30 * 60 * 1000;
		this.balanceInterval = setInterval(() => {
			balanceService.getBalance(true).catch((err) => logger.error('Scheduled balance check failed', { error: err }));
		}, THIRTY_MINUTES);
	}

	stop(): void {
		if (this.initialSyncTimeout) clearTimeout(this.initialSyncTimeout);
		if (this.initialReconcileTimeout) clearTimeout(this.initialReconcileTimeout);
		if (this.initialBalanceTimeout) clearTimeout(this.initialBalanceTimeout);
		if (this.syncInterval) clearInterval(this.syncInterval);
		if (this.reconcilerInterval) clearInterval(this.reconcilerInterval);
		if (this.balanceInterval) clearInterval(this.balanceInterval);
		logger.info('Internal background scheduler stopped');
	}
}

export const cronScheduler = new CronScheduler();
