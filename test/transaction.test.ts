import { describe, it, expect } from 'bun:test';
import { transactionService } from '../src/transaction/transaction-service';

describe('Transaction Service Orchestration', () => {
	it('successfully executes a top-up transaction in dummy mode', async () => {
		const orderId = 'ORD-TEST-001';
		const sku = 'MLBB-86';
		const customerNo = '12345678(1234)';

		const res = await transactionService.executeTransaction({
			orderId,
			sku,
			customerNo,
			amount: 20000,
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe('success');
		expect(res.orderId).toBe(orderId);
		expect(res.refId).toContain(`FS-${orderId}`);
		expect(res.serialNumber).toBeDefined();
		expect(res.rc).toBe('00');
	});

	it('rejects transaction when balance validation fails', async () => {
		// Mock order with huge amount that exceeds dummy deposit
		const res = await transactionService.executeTransaction({
			orderId: 'ORD-TEST-POOR',
			sku: 'MLBB-HUGE',
			customerNo: '12345678',
			amount: 999_999_999, // 999M will exceed 10M deposit
		});

		expect(res.ok).toBe(false);
		expect(res.status).toBe('failed');
		expect(res.message).toContain('tidak mencukupi');
	});
});
