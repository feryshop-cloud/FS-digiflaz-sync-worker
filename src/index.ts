import { Hono } from 'hono';
import { config } from './config';
import { logger } from './lib/logger';
import { serviceAuthMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { balanceService } from './balance/balance-service';
import { transactionService } from './transaction/transaction-service';
import { runProductSync } from './sync/product-sync';
import { digiflazzClient } from './digiflazz/client';
import { cronScheduler } from './cron/scheduler';
import { register, httpRequestsTotal, httpRequestDurationSeconds } from './lib/metrics';
import { handleDigiflazzWebhook } from './webhook/handler';
import type { ExecuteTransactionParams } from './types/transaction';

export const app = new Hono();

// Global error handling
app.onError(errorHandler);

// HTTP Logging and Prometheus Metrics middleware
app.use('*', async (c, next) => {
	const start = Date.now();
	await next();
	const durationMs = Date.now() - start;
	const route = c.req.path;
	const statusCode = String(c.res.status);

	httpRequestsTotal.inc({ method: c.req.method, route, status_code: statusCode });
	httpRequestDurationSeconds.observe({ method: c.req.method, route, status_code: statusCode }, durationMs / 1000);

	logger.info('HTTP request completed', {
		method: c.req.method,
		path: c.req.path,
		status: c.res.status,
		durationMs,
	});
});

// 1. Healthcheck (public / unauthenticated)
app.get('/health', (c) => {
	return c.json({
		status: 'ok',
		service: 'fs-digiflazz-service',
		uptimeSeconds: Math.floor(process.uptime()),
		timestamp: new Date().toISOString(),
	});
});

// Backward compatibility healthcheck
app.get('/__health', (c) => c.json({ ok: true }));

// Prometheus Metrics Scrape Endpoint (public for internal monitoring network)
app.get('/metrics', async (c) => {
	c.header('Content-Type', register.contentType);
	return c.text(await register.metrics());
});

// 2. Cek Saldo Deposit Digiflazz
app.get('/v1/balance', serviceAuthMiddleware, async (c) => {
	const force = c.req.query('refresh') === 'true';
	const balance = await balanceService.getBalance(force);
	return c.json({
		ok: true,
		data: balance,
	});
});

// 2b. Request Tiket Deposit Digiflazz
app.post('/v1/deposit', serviceAuthMiddleware, async (c) => {
	const body = await c.req.json<{ amount?: number; bank?: string; ownerName?: string }>();

	if (!body.amount || body.amount < 10000) {
		return c.json(
			{
				ok: false,
				error: 'ValidationFailed',
				message: 'Nominal deposit minimal Rp 10.000',
			},
			400,
		);
	}

	if (!body.bank || typeof body.bank !== 'string') {
		return c.json(
			{
				ok: false,
				error: 'ValidationFailed',
				message: 'Nama bank tujuan wajib diisi',
			},
			400,
		);
	}

	if (!body.ownerName || typeof body.ownerName !== 'string') {
		return c.json(
			{
				ok: false,
				error: 'ValidationFailed',
				message: 'Nama pemilik rekening wajib diisi',
			},
			400,
		);
	}

	const ticket = await digiflazzClient.createDepositTicket({
		amount: Math.floor(body.amount),
		bank: body.bank.trim(),
		ownerName: body.ownerName.trim(),
	});

	return c.json({
		ok: true,
		data: ticket,
	});
});

// 3. Eksekusi Transaksi Top-Up
app.post('/v1/transactions', serviceAuthMiddleware, async (c) => {
	const body = await c.req.json<ExecuteTransactionParams>();

	if (!body.orderId || !body.sku || !body.customerNo) {
		return c.json(
			{
				ok: false,
				error: 'ValidationFailed',
				message: 'Field orderId, sku, dan customerNo wajib diisi',
			},
			400,
		);
	}

	const result = await transactionService.executeTransaction(body);
	const httpStatus = result.status === 'failed' && result.message.includes('mencukupi') ? 422 : 200;

	return c.json(
		{
			ok: result.ok,
			data: result,
		},
		httpStatus,
	);
});

// 4. Cek Status Transaksi Spesifik
app.get('/v1/transactions/:ref_id', serviceAuthMiddleware, async (c) => {
	const refId = c.req.param('ref_id');
	const sku = c.req.query('sku') || '';
	const customerNo = c.req.query('customer_no') || '';

	if (!refId || !sku || !customerNo) {
		return c.json(
			{
				ok: false,
				error: 'ValidationFailed',
				message: 'Params ref_id, sku, dan customer_no wajib disertakan',
			},
			400,
		);
	}

	const status = await digiflazzClient.checkTransactionStatus({
		refId,
		sku,
		customerNo,
	});

	return c.json({
		ok: true,
		data: status,
	});
});

// 5. Trigger Manual Sinkronisasi Produk
const handleSync = async (c: any) => {
	logger.info('Manual product sync triggered via API');
	// Jalankan secara asynchronous di background agar response tidak timeout
	runProductSync()
		.then((res) => logger.info('Manual sync completed successfully', { result: res }))
		.catch((err) => logger.error('Manual sync failed', { error: err }));

	return c.json(
		{
			ok: true,
			accepted: true,
			message: 'Sinkronisasi produk telah dimulai di background',
		},
		202,
	);
};

app.post('/v1/sync', serviceAuthMiddleware, handleSync);
app.post('/__sync', serviceAuthMiddleware, handleSync); // Backward compatibility endpoint

// 6. Webhook Ingress (Digiflazz Callback)
// Catatan: Tidak menggunakan serviceAuthMiddleware karena otentikasi divalidasi via HMAC SHA-1 (X-Hub-Signature)
app.post('/v1/webhook', handleDigiflazzWebhook);

// Jalankan background cron scheduler saat server start (hanya di luar test)
if (process.env.NODE_ENV !== 'test') {
	cronScheduler.start();
}

// Server startup via Bun
logger.info(`Starting fs-digiflazz-service on port ${config.port} (env: ${config.nodeEnv})`);

export default {
	port: config.port,
	fetch: app.fetch,
};
