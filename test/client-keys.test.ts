import { describe, it, expect } from 'bun:test';
import { loadConfig } from '../src/config';

describe('Digiflazz Key Configuration & Resolution', () => {
	it('correctly maps DIGIFLAZZ_PROD_KEY and DIGIFLAZZ_DEV_KEY', () => {
		const originalEnv = { ...process.env };

		try {
			process.env.DIGIFLAZZ_PROD_KEY = 'prod-key-123';
			process.env.DIGIFLAZZ_DEV_KEY = 'dev-key-456';
			process.env.DIGIFLAZZ_API_KEY = '';

			const cfg = loadConfig();
			expect(cfg.digiflazz.prodApiKey).toBe('prod-key-123');
			expect(cfg.digiflazz.devApiKey).toBe('dev-key-456');
			expect(cfg.digiflazz.apiKey).toBe('prod-key-123');
		} finally {
			process.env = originalEnv;
		}
	});

	it('gracefully handles legacy DIGIFLAZZ_API_KEY with dev- prefix', () => {
		const originalEnv = { ...process.env };

		try {
			delete process.env.DIGIFLAZZ_PROD_KEY;
			delete process.env.DIGIFLAZZ_DEV_KEY;
			process.env.DIGIFLAZZ_API_KEY = 'dev-legacy-key';

			const cfg = loadConfig();
			expect(cfg.digiflazz.devApiKey).toBe('dev-legacy-key');
			expect(cfg.digiflazz.prodApiKey).toBe('');
			expect(cfg.digiflazz.apiKey).toBe('dev-legacy-key');
		} finally {
			process.env = originalEnv;
		}
	});

	it('gracefully handles legacy DIGIFLAZZ_API_KEY without dev- prefix as prod', () => {
		const originalEnv = { ...process.env };

		try {
			delete process.env.DIGIFLAZZ_PROD_KEY;
			delete process.env.DIGIFLAZZ_DEV_KEY;
			process.env.DIGIFLAZZ_API_KEY = 'prod-legacy-key';

			const cfg = loadConfig();
			expect(cfg.digiflazz.prodApiKey).toBe('prod-legacy-key');
			expect(cfg.digiflazz.devApiKey).toBe('');
			expect(cfg.digiflazz.apiKey).toBe('prod-legacy-key');
		} finally {
			process.env = originalEnv;
		}
	});
});
