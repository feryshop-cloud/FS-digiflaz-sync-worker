import type { Context, Next } from 'hono';
import { config } from '../config';
import { logger } from '../lib/logger';

export async function serviceAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
	const expectedKey = config.auth.serviceApiKey || config.auth.syncSecret;

	// Jika key tidak dikonfigurasi (misal di mode testing lokal), izinkan akses dengan peringatan
	if (!expectedKey) {
		logger.warn('Service API key not configured, allowing request without auth');
		return next();
	}

	const authHeader = c.req.header('Authorization')?.trim();
	const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
	const apiKeyHeader = c.req.header('x-api-key')?.trim();
	const syncTokenHeader = c.req.header('x-sync-token')?.trim();

	const providedToken = bearerToken || apiKeyHeader || syncTokenHeader;

	if (!providedToken || providedToken !== expectedKey) {
		logger.warn('Unauthorized inter-service request attempt', {
			path: c.req.path,
			ip: c.req.header('x-forwarded-for') || 'unknown',
		});
		return c.json(
			{
				ok: false,
				error: 'Unauthorized',
				message: 'Valid inter-service API key or Bearer token required',
			},
			401,
		);
	}

	return next();
}
