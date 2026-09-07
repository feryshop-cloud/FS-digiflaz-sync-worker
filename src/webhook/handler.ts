import type { Context } from 'hono';
import { config } from '../config';
import { logger } from '../lib/logger';
import { digiflazzWebhooksReceivedTotal } from '../lib/metrics';
import { verifyWebhookSignature } from './signature';
import { supabaseClient } from '../supabase/client';
import { balanceService } from '../balance/balance-service';
import { parseDigiflazzStatus } from '../transaction/transaction-service';
import type { DigiflazzWebhookPayload } from '../types/digiflazz';

/**
 * Handler untuk HTTP POST /v1/webhook dari Digiflazz
 */
export async function handleDigiflazzWebhook(c: Context) {
	const signatureHeader = c.req.header('x-hub-signature') || c.req.header('X-Hub-Signature');
	const eventHeader = (c.req.header('x-digiflazz-event') || c.req.header('X-Digiflazz-Event') || 'update').toLowerCase();
	const deliveryHeader = c.req.header('x-digiflazz-delivery') || c.req.header('X-Digiflazz-Delivery') || '';

	let rawBody: string;
	try {
		rawBody = await c.req.text();
	} catch (err) {
		logger.error('Failed to read webhook request body', { error: err });
		return c.json({ ok: false, error: 'ReadError', message: 'Failed to read request body' }, 400);
	}

	// 1. Validasi HMAC SHA-1 Signature
	const isValidSignature = verifyWebhookSignature(rawBody, signatureHeader, config.digiflazz.webhookSecret);
	if (!isValidSignature) {
		logger.warn('Rejected Digiflazz webhook: Invalid signature', {
			event: eventHeader,
			delivery: deliveryHeader,
		});
		return c.json({ ok: false, error: 'InvalidSignature', message: 'Invalid X-Hub-Signature' }, 401);
	}

	// 2. Parse JSON Payload
	let payload: DigiflazzWebhookPayload;
	try {
		payload = JSON.parse(rawBody);
	} catch (err) {
		logger.error('Failed to parse webhook JSON payload', { error: err, rawBody });
		return c.json({ ok: false, error: 'InvalidPayload', message: 'Payload is not valid JSON' }, 400);
	}

	// 3. Tangani ping event dari dashboard Digiflazz
	if (eventHeader === 'ping' || payload.event === 'ping') {
		logger.info('Digiflazz webhook ping received successfully', { delivery: deliveryHeader });
		digiflazzWebhooksReceivedTotal.inc({ event: 'ping', status: 'ok' });
		return c.json({
			ok: true,
			message: 'Pong! Digiflazz webhook endpoint is active and healthy.',
			timestamp: new Date().toISOString(),
		});
	}

	// 4. Validasi payload data transaksi
	const item = payload.data;
	if (!item || !item.ref_id) {
		logger.warn('Digiflazz webhook received without transaction data or ref_id', { payload });
		return c.json({ ok: false, error: 'MissingData', message: 'Payload data or ref_id is missing' }, 400);
	}

	const refId = item.ref_id;
	const rc = item.rc;
	const statusText = item.status;
	const sn = item.sn || undefined;
	const message = item.message || '';
	const buyerLastSaldo = item.buyer_last_saldo;
	const status = parseDigiflazzStatus(rc, statusText);

	logger.info('Digiflazz webhook received for transaction', {
		refId,
		event: eventHeader,
		delivery: deliveryHeader,
		rc,
		statusText,
		parsedStatus: status,
		sn,
	});

	// 5. Update cached balance jika dikirimkan di payload
	if (typeof buyerLastSaldo === 'number') {
		balanceService.updateCachedDeposit(buyerLastSaldo);
	}

	// 6. Cek transaksi di Supabase untuk idempotency & update
	try {
		const existingTx = await supabaseClient.getTransactionByRefId(refId);

		if (existingTx) {
			// Idempotency: jika status dan serial number sudah cocok, tidak perlu update ulang
			if (existingTx.status === status && (sn === undefined || existingTx.serial_number === sn)) {
				logger.info('Webhook event already processed (idempotent duplicate)', { refId, status });
				digiflazzWebhooksReceivedTotal.inc({ event: eventHeader, status: 'duplicate' });
				return c.json({
					ok: true,
					received: true,
					idempotent: true,
					ref_id: refId,
					refId,
					status,
				});
			}

			// Update transaksi di digiflazz_transactions
			await supabaseClient.updateTransaction(refId, {
				status,
				serial_number: sn ?? existingTx.serial_number,
				digiflazz_rc: rc ?? existingTx.digiflazz_rc,
				digiflazz_message: message || existingTx.digiflazz_message,
				digiflazz_response: payload as Record<string, unknown>,
				balance_after: typeof buyerLastSaldo === 'number' ? buyerLastSaldo : existingTx.balance_after,
			});

			// Update orders table jika transaksi final (success atau failed)
			if (existingTx.order_id) {
				if (status === 'success') {
					await supabaseClient.updateOrderStatus(existingTx.order_id, {
						buyStatus: 'success',
						serialNumber: sn,
					});
					logger.info('Order marked as SUCCESS via Digiflazz webhook', { orderId: existingTx.order_id, refId });
				} else if (status === 'failed') {
					await supabaseClient.updateOrderStatus(existingTx.order_id, {
						buyStatus: 'failed',
					});
					logger.info('Order marked as FAILED via Digiflazz webhook', { orderId: existingTx.order_id, refId });
				}
			}
		} else {
			logger.warn('Webhook transaction ref_id not found in local DB', { refId, status });
		}
	} catch (dbErr) {
		logger.error('Error processing webhook DB updates', { refId, error: dbErr });
		// Tetap lanjutkan agar Digiflazz menerima response 200 (mencegah retry loop berlebihan jika DB error sementara)
	}

	digiflazzWebhooksReceivedTotal.inc({ event: eventHeader, status });

	return c.json({
		ok: true,
		received: true,
		ref_id: refId,
		refId,
		status,
	});
}
