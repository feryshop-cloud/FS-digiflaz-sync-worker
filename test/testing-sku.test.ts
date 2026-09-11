import { describe, it, expect } from 'bun:test';
import { transactionService } from '../src/transaction/transaction-service';
import { digiflazzClient } from '../src/digiflazz/client';

describe('Digiflazz Sandbox SKU Testing (xld10)', () => {
	it('executes Sukses scenario for customer_no: 087800001230', async () => {
		const orderId = `TEST-SUKSES-${Date.now()}`;
		const res = await transactionService.executeTransaction({
			orderId,
			sku: 'xld10',
			customerNo: '087800001230',
			amount: 10000,
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe('success');
		expect(res.rc).toBe('00');
		expect(res.serialNumber).toBeDefined();
	});

	it('executes Gagal scenario for customer_no: 087800001232', async () => {
		const orderId = `TEST-GAGAL-${Date.now()}`;
		const res = await transactionService.executeTransaction({
			orderId,
			sku: 'xld10',
			customerNo: '087800001232',
			amount: 10000,
		});

		expect(res.ok).toBe(false);
		expect(res.status).toBe('failed');
		expect(res.rc).toBe('02');
		expect(res.message).toContain('GAGAL');
	});

	it('executes Pending kemudian Sukses scenario for customer_no: 087800001233', async () => {
		const orderId = `TEST-PENDING-SUK-${Date.now()}`;
		const res = await transactionService.executeTransaction({
			orderId,
			sku: 'xld10',
			customerNo: '087800001233',
			amount: 10000,
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe('pending');
		expect(res.rc).toBe('01');

		// Simulasikan pengecekan status transaksi / reconciler
		const statusRes = await digiflazzClient.checkTransactionStatus({
			sku: 'xld10',
			customerNo: '087800001233',
			refId: res.refId,
		});

		expect(statusRes?.rc).toBe('00');
		expect(statusRes?.status?.toLowerCase()).toBe('sukses');
		expect(statusRes?.sn).toBeDefined();
	});

	it('executes Pending kemudian Gagal scenario for customer_no: 087800001234', async () => {
		const orderId = `TEST-PENDING-GAG-${Date.now()}`;
		const res = await transactionService.executeTransaction({
			orderId,
			sku: 'xld10',
			customerNo: '087800001234',
			amount: 10000,
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe('pending');
		expect(res.rc).toBe('01');

		// Simulasikan pengecekan status transaksi / reconciler
		const statusRes = await digiflazzClient.checkTransactionStatus({
			sku: 'xld10',
			customerNo: '087800001234',
			refId: res.refId,
		});

		expect(statusRes?.rc).toBe('02');
		expect(statusRes?.status?.toLowerCase()).toBe('gagal');
	});

	it('bypasses pre-transaction balance check when testing SKU xld10 is used even with huge amount', async () => {
		const orderId = `TEST-BALANCE-BYPASS-${Date.now()}`;
		const res = await transactionService.executeTransaction({
			orderId,
			sku: 'xld10',
			customerNo: '087800001230',
			amount: 999_999_999_999, // Sangat besar tapi tidak boleh ditolak karena mode test sandbox
		});

		expect(res.ok).toBe(true);
		expect(res.status).toBe('success');
	});
});
