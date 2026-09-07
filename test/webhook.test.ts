import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { computeWebhookSignature, verifyWebhookSignature } from '../src/webhook/signature';
import { app } from '../src/index';
import { config } from '../src/config';
import { balanceService } from '../src/balance/balance-service';

describe('Digiflazz Webhook Signature Validation', () => {
	const secret = 'test-webhook-secret-key-12345';
	const payload = JSON.stringify({
		data: {
			ref_id: 'FS-ORD-12345-123',
			status: 'Sukses',
			rc: '00',
			sn: 'SN-99887766',
			buyer_last_saldo: 7500000,
		},
	});

	it('computes and verifies HMAC SHA-1 signature correctly', () => {
		const signature = computeWebhookSignature(payload, secret);
		expect(signature).toStartWith('sha1=');

		const isValid = verifyWebhookSignature(payload, signature, secret);
		expect(isValid).toBe(true);
	});

	it('rejects tampered payload', () => {
		const signature = computeWebhookSignature(payload, secret);
		const tamperedPayload = payload + ' ';

		const isValid = verifyWebhookSignature(tamperedPayload, signature, secret);
		expect(isValid).toBe(false);
	});

	it('rejects signature calculated with different secret', () => {
		const signature = computeWebhookSignature(payload, 'wrong-secret');
		const isValid = verifyWebhookSignature(payload, signature, secret);
		expect(isValid).toBe(false);
	});

	it('rejects request when X-Hub-Signature header is missing and secret is set', () => {
		const isValid = verifyWebhookSignature(payload, undefined, secret);
		expect(isValid).toBe(false);
	});

	it('allows request gracefully when secret is not configured', () => {
		const isValid = verifyWebhookSignature(payload, undefined, undefined);
		expect(isValid).toBe(true);
	});
});

describe('Digiflazz Webhook Endpoint Integration', () => {
	const testSecret = 'secret-integration-test';
	let originalSecret: string | undefined;

	beforeEach(() => {
		originalSecret = config.digiflazz.webhookSecret;
		config.digiflazz.webhookSecret = testSecret;
	});

	afterEach(() => {
		config.digiflazz.webhookSecret = originalSecret;
	});

	it('handles ping event successfully with HTTP 200', async () => {
		const body = JSON.stringify({ event: 'ping' });
		const signature = computeWebhookSignature(body, testSecret);

		const res = await app.request('/v1/webhook', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Hub-Signature': signature,
				'X-Digiflazz-Event': 'ping',
				'X-Digiflazz-Delivery': 'test-ping-uuid-1',
			},
			body,
		});

		expect(res.status).toBe(200);
		const json = (await res.json()) as any;
		expect(json.ok).toBe(true);
		expect(json.message).toContain('Pong');
	});

	it('rejects request with invalid signature with HTTP 401', async () => {
		const body = JSON.stringify({ data: { ref_id: 'test' } });

		const res = await app.request('/v1/webhook', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Hub-Signature': 'sha1=invalidhex12345678901234567890123456789012345678',
				'X-Digiflazz-Event': 'update',
			},
			body,
		});

		expect(res.status).toBe(401);
		const json = (await res.json()) as any;
		expect(json.ok).toBe(false);
		expect(json.error).toBe('InvalidSignature');
	});

	it('returns HTTP 400 on malformed JSON payload', async () => {
		const malformed = '{ invalid json body...';
		const signature = computeWebhookSignature(malformed, testSecret);

		const res = await app.request('/v1/webhook', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Hub-Signature': signature,
			},
			body: malformed,
		});

		expect(res.status).toBe(400);
		const json = (await res.json()) as any;
		expect(json.ok).toBe(false);
		expect(json.error).toBe('InvalidPayload');
	});

	it('returns HTTP 400 when ref_id is missing from data', async () => {
		const body = JSON.stringify({ data: { status: 'Sukses' } });
		const signature = computeWebhookSignature(body, testSecret);

		const res = await app.request('/v1/webhook', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Hub-Signature': signature,
			},
			body,
		});

		expect(res.status).toBe(400);
		const json = (await res.json()) as any;
		expect(json.ok).toBe(false);
		expect(json.error).toBe('MissingData');
	});

	it('processes valid transaction update and updates cached balance', async () => {
		const payload = {
			data: {
				ref_id: 'FS-ORD-WEBHOOK-999',
				customer_no: '08123456789',
				buyer_sku_code: 'MLBB-86',
				message: 'TRANSAKSI BERHASIL',
				status: 'Sukses',
				rc: '00',
				sn: 'SN-WEBHOOK-999-SUCCESS',
				buyer_last_saldo: 8888000,
			},
		};
		const body = JSON.stringify(payload);
		const signature = computeWebhookSignature(body, testSecret);

		const res = await app.request('/v1/webhook', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Hub-Signature': signature,
				'X-Digiflazz-Event': 'update',
				'X-Digiflazz-Delivery': 'test-deliv-uuid-999',
			},
			body,
		});

		expect(res.status).toBe(200);
		const json = (await res.json()) as any;
		expect(json.ok).toBe(true);
		expect(json.ref_id).toBe('FS-ORD-WEBHOOK-999');
		expect(json.status).toBe('success');

		// Verifikasi balance cache ter-update
		const balance = await balanceService.getBalance();
		expect(balance.deposit).toBe(8888000);
		expect(balance.cached).toBe(true);
	});
});
