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
