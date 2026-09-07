import { describe, it, expect } from 'bun:test';
import { balanceService } from '../src/balance/balance-service';
import { validateSufficientBalance } from '../src/balance/validation';
import { digiflazzClient } from '../src/digiflazz/client';

describe('Balance Service & Validation', () => {
	it('retrieves balance and caches result in dummy mode', async () => {
		const res1 = await balanceService.getBalance();
		expect(res1.deposit).toBeGreaterThan(0);
		expect(res1.cached).toBe(false);

		// Panggilan kedua harus menggunakan cache
		const res2 = await balanceService.getBalance();
		expect(res2.deposit).toBe(res1.deposit);
		expect(res2.cached).toBe(true);
	});

	it('validates sufficient balance when deposit is high', async () => {
		// Deposit dummy adalah 10.000.000
		const validation = await validateSufficientBalance(50_000, 50_000);
		expect(validation.ok).toBe(true);
		expect(validation.requiredBalance).toBe(100_000);
	});

	it('rejects transaction when deposit is insufficient', async () => {
		// Tes dengan batas minimum cadangan yang sangat tinggi
		const validation = await validateSufficientBalance(50_000, 20_000_000);
		expect(validation.ok).toBe(false);
		expect(validation.reason).toContain('tidak mencukupi');
	});

	it('creates deposit ticket in dummy mode', async () => {
		const ticket = await digiflazzClient.createDepositTicket({
			amount: 500_000,
			bank: 'BCA',
			ownerName: 'John Doe',
		});
		expect(ticket.rc).toBe('00');
		expect(ticket.bank).toBe('BCA');
		expect(ticket.amount).toBeGreaterThanOrEqual(500_000);
		expect(ticket.account_no).toBeTruthy();
		expect(ticket.notes).toBeTruthy();
		expect(ticket.expires_at).toBeTruthy();
	});
});
