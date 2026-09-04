import { digiflazzClient } from '../digiflazz/client';
import { supabaseClient } from '../supabase/client';
import { balanceService } from '../balance/balance-service';
import { validateSufficientBalance } from '../balance/validation';
import { logger } from '../lib/logger';
import type {
	ExecuteTransactionParams,
	ExecuteTransactionResult,
	DigiflazzTransactionRecord,
	TransactionStatus,
} from '../types/transaction';

function parseDigiflazzStatus(rc?: string, statusText?: string): TransactionStatus {
	if (rc === '00' || statusText?.toLowerCase() === 'sukses') return 'success';
	if (rc === '01' || statusText?.toLowerCase() === 'pending') return 'pending';
	if (rc === '02' || statusText?.toLowerCase() === 'gagal' || statusText?.toLowerCase() === 'batal') return 'failed';
	return 'unknown';
}

export class TransactionService {
	/**
	 * Menjalankan orkestrasi transaksi top-up ke Digiflazz:
	 * 1. Validasi saldo deposit (pre-transaction check)
	 * 2. Generate ref_id unik
	 * 3. Catat entri pending di tabel digiflazz_transactions
	 * 4. Panggil Digiflazz API
	 * 5. Update hasil transaksi ke DB dan perbarui status pesanan jika sukses
	 */
	async executeTransaction(params: ExecuteTransactionParams): Promise<ExecuteTransactionResult> {
		const { orderId, sku, customerNo, amount = 0, testing = false } = params;
		const refId = `FS-${orderId}-${Date.now()}`;

		logger.info('Executing Digiflazz transaction', { orderId, refId, sku, customerNo, amount });

		// 1. Validasi Saldo Pre-Transaksional jika amount > 0
		let balanceBefore: number | undefined;
		if (amount > 0) {
			const validation = await validateSufficientBalance(amount);
			balanceBefore = validation.currentBalance;
			if (!validation.ok) {
				return {
					ok: false,
					status: 'failed',
					refId,
					orderId,
					message: validation.reason || 'Saldo deposit Digiflazz tidak mencukupi',
					balanceBefore,
				};
			}
		}

		// 2. Simpan entri awal di tabel digiflazz_transactions
		const initialRecord: DigiflazzTransactionRecord = {
			order_id: orderId,
			ref_id: refId,
			buyer_sku_code: sku,
			customer_no: customerNo,
			amount,
			status: 'pending',
			balance_before: balanceBefore ?? null,
			retry_count: 0,
		};

		try {
			await supabaseClient.insertTransaction(initialRecord);
		} catch (err) {
			logger.warn('Failed to insert initial transaction record to Supabase, proceeding with API call', { error: err });
		}

		// 3. Panggil Digiflazz Transaction API
		try {
			const apiRes = await digiflazzClient.createTransaction({
				sku,
				customerNo,
				refId,
				testing,
			});

			const status = parseDigiflazzStatus(apiRes?.rc, apiRes?.status);
			const sn = apiRes?.sn || undefined;
			const balanceAfter = apiRes?.buyer_last_saldo;

			if (balanceAfter !== undefined && balanceAfter !== null) {
				balanceService.updateCachedDeposit(balanceAfter);
			}

			// 4. Update transaksi di DB
			const updates: Partial<DigiflazzTransactionRecord> = {
				status,
				serial_number: sn ?? null,
				digiflazz_rc: apiRes?.rc ?? null,
				digiflazz_message: apiRes?.message ?? null,
				digiflazz_response: apiRes as Record<string, unknown>,
				balance_after: balanceAfter ?? null,
			};

			await supabaseClient.updateTransaction(refId, updates).catch((err) => {
				logger.error('Failed to update transaction in Supabase', { refId, error: err });
			});

			// 5. Jika sukses, perbarui fulfillment status pesanan utama
			if (status === 'success') {
				await supabaseClient
					.updateOrderStatus(orderId, {
						fulfillmentStatus: 'SUCCESS',
						serialNumber: sn,
					})
					.catch((err) => {
						logger.error('Failed to update order status in Supabase', { orderId, error: err });
					});
			} else if (status === 'failed') {
				await supabaseClient
					.updateOrderStatus(orderId, {
						fulfillmentStatus: 'FAILED',
					})
					.catch((err) => {
						logger.error('Failed to mark order as FAILED in Supabase', { orderId, error: err });
					});
			}

			return {
				ok: status === 'success' || status === 'pending',
				status,
				refId,
				orderId,
				serialNumber: sn,
				rc: apiRes?.rc,
				message: apiRes?.message || 'Transaksi diproses',
				balanceBefore,
				balanceAfter,
			};
		} catch (error) {
			logger.error('Digiflazz API execution failed', { refId, orderId, error });

			await supabaseClient
				.updateTransaction(refId, {
					status: 'unknown',
					digiflazz_message: error instanceof Error ? error.message : 'Unknown error',
				})
				.catch(() => {});

			return {
				ok: false,
				status: 'unknown',
				refId,
				orderId,
				message: error instanceof Error ? error.message : 'Gagal menghubungi Digiflazz API',
				balanceBefore,
			};
		}
	}
}

export const transactionService = new TransactionService();
