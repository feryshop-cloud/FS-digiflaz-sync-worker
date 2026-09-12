import { balanceService } from './balance-service';
import { config } from '../config';
import { logger } from '../lib/logger';

export interface BalanceValidationResult {
	ok: boolean;
	currentBalance: number;
	requiredBalance: number;
	minReserve: number;
	reason?: string;
}

/**
 * Send saldo_kritis notification to admin via Supabase REST API
 */
async function sendSaldoKritisNotification(deposit: number, requiredBalance: number, minReserve: number): Promise<void> {
	try {
		const supabaseUrl = config.supabase.url;
		const serviceRoleKey = config.supabase.serviceRoleKey;
		if (!supabaseUrl || !serviceRoleKey) return;

		await fetch(`${supabaseUrl}/rest/v1/notifications`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${serviceRoleKey}`,
				'Content-Type': 'application/json',
				Prefer: 'return=minimal',
			},
			body: JSON.stringify({
				type: 'saldo_kritis',
				title: 'Saldo Deposit Digiflazz Kritis',
				body: `Saldo tersedia Rp${deposit.toLocaleString('id-ID')}, dibutuhkan Rp${requiredBalance.toLocaleString('id-ID')}`,
				metadata: { deposit, requiredBalance, minReserve },
				target_roles: ['OWNER'],
			}),
		});
	} catch (err) {
		logger.warn('Failed to send saldo_kritis notification', { error: err });
	}
}

/**
 * Validasi apakah saldo deposit Digiflazz saat ini mencukupi untuk memproses pesanan.
 * Kriteria: Saldo Deposit >= Harga Produk + Batas Cadangan Minimum (Min Reserve).
 *
 * @param productPrice Harga modal produk dari provider
 * @param customMinReserve Override opsional untuk min reserve
 */
export async function validateSufficientBalance(productPrice: number, customMinReserve?: number): Promise<BalanceValidationResult> {
	const minReserve = customMinReserve ?? config.digiflazz.minReserve;
	const requiredBalance = productPrice + minReserve;

	const { deposit } = await balanceService.getBalance();

	if (deposit < requiredBalance) {
		const reason = `Saldo deposit Digiflazz tidak mencukupi (Tersedia: Rp${deposit.toLocaleString('id-ID')}, Dibutuhkan: Rp${requiredBalance.toLocaleString('id-ID')} termasuk cadangan Rp${minReserve.toLocaleString('id-ID')})`;
		logger.warn('Pre-transaction balance check failed', {
			deposit,
			productPrice,
			minReserve,
			requiredBalance,
			reason,
		});

		// Send notification to admin
		await sendSaldoKritisNotification(deposit, requiredBalance, minReserve);

		return {
			ok: false,
			currentBalance: deposit,
			requiredBalance,
			minReserve,
			reason,
		};
	}

	return {
		ok: true,
		currentBalance: deposit,
		requiredBalance,
		minReserve,
	};
}
