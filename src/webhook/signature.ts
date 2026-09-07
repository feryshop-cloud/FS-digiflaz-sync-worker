import crypto from 'node:crypto';
import { logger } from '../lib/logger';

/**
 * Menghitung HMAC SHA-1 signature dari payload string (format: sha1=<hex>)
 */
export function computeWebhookSignature(payload: string, secret: string): string {
	const hash = crypto.createHmac('sha1', secret).update(payload).digest('hex');
	return `sha1=${hash}`;
}

/**
 * Memvalidasi X-Hub-Signature header dari Digiflazz Webhook.
 * Menggunakan perbandingan timing-safe untuk mencegah timing attacks.
 *
 * Jika secret tidak dikonfigurasi di environment, fungsi mengembalikan true
 * dengan peringatan di log (agar tidak memblokir transaksi saat onboarding).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null | undefined, secret: string | undefined): boolean {
	if (!secret) {
		logger.warn('DIGIFLAZZ_WEBHOOK_SECRET is not configured; skipping signature verification');
		return true;
	}

	if (!signatureHeader) {
		logger.warn('Missing X-Hub-Signature header in webhook request');
		return false;
	}

	const expectedPrefix = 'sha1=';
	const providedHash = signatureHeader.startsWith(expectedPrefix)
		? signatureHeader.slice(expectedPrefix.length).trim()
		: signatureHeader.trim();

	const computedHash = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

	if (computedHash.length !== providedHash.length) {
		return false;
	}

	try {
		return crypto.timingSafeEqual(Buffer.from(computedHash, 'utf8'), Buffer.from(providedHash, 'utf8'));
	} catch (err) {
		logger.error('Error comparing webhook signatures', { error: err });
		return false;
	}
}
