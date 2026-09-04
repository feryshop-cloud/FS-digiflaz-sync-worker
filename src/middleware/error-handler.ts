import type { Context } from 'hono';
import { logger } from '../lib/logger';

export function errorHandler(err: Error, c: Context): Response {
	logger.error('Unhandled request error', {
		path: c.req.path,
		method: c.req.method,
		error: err,
	});

	const status = 'status' in err && typeof err.status === 'number' ? err.status : 500;

	return c.json(
		{
			ok: false,
			error: err.name || 'InternalServerError',
			message: err.message || 'An unexpected error occurred',
		},
		status as 500,
	);
}
