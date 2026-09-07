import { Registry, collectDefaultMetrics, Counter, Gauge, Histogram } from 'prom-client';

export const register = new Registry();

// Collect standard process / runtime metrics
collectDefaultMetrics({
	register,
	prefix: 'digiflazz_service_',
});

// 1. HTTP Request Metrics
export const httpRequestsTotal = new Counter({
	name: 'digiflazz_service_http_requests_total',
	help: 'Total number of HTTP requests processed by fs-digiflazz-service',
	labelNames: ['method', 'route', 'status_code'] as const,
	registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
	name: 'digiflazz_service_http_request_duration_seconds',
	help: 'Duration of HTTP requests in seconds',
	labelNames: ['method', 'route', 'status_code'] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
	registers: [register],
});

// 2. Digiflazz Deposit Balance Gauge
export const digiflazzBalanceDeposit = new Gauge({
	name: 'digiflazz_balance_deposit_amount',
	help: 'Current Digiflazz deposit balance in IDR',
	registers: [register],
});

// 3. Transactions Metrics
export const digiflazzTransactionsTotal = new Counter({
	name: 'digiflazz_transactions_total',
	help: 'Total number of Digiflazz top-up transactions executed',
	labelNames: ['status', 'sku'] as const,
	registers: [register],
});

// 4. Product Sync Metrics
export const digiflazzSyncTotal = new Counter({
	name: 'digiflazz_sync_total',
	help: 'Total number of Digiflazz product pricelist synchronizations',
	labelNames: ['status'] as const,
	registers: [register],
});

export const digiflazzSyncDurationSeconds = new Gauge({
	name: 'digiflazz_sync_duration_seconds',
	help: 'Duration of the last product synchronization in seconds',
	registers: [register],
});

export const digiflazzSyncItemsCount = new Gauge({
	name: 'digiflazz_sync_items_count',
	help: 'Count of items processed during product sync',
	labelNames: ['type'] as const, // 'upserted' | 'skipped' | 'stale'
	registers: [register],
});

// 5. Webhook Metrics
export const digiflazzWebhooksReceivedTotal = new Counter({
	name: 'digiflazz_webhooks_received_total',
	help: 'Total number of Digiflazz webhook notifications received',
	labelNames: ['event', 'status'] as const,
	registers: [register],
});
