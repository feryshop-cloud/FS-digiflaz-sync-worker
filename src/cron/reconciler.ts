import { supabaseClient } from '../supabase/client';
import { digiflazzClient } from '../digiflazz/client';
import { balanceService } from '../balance/balance-service';
import { logger } from '../lib/logger';

export async function reconcilePendingTransactions(): Promise<{ reconciled: number; total: number }> {
	try {
		const pendingList = await supabaseClient.getPendingTransactions(20);
		if (pendingList.length === 0) {
			return { reconciled: 0, total: 0 };
		}

		logger.info(`Reconciler: checking ${pendingList.length} pending transactions...`);
		let reconciledCount = 0;

		for (const tx of pendingList) {
			try {
				const statusRes = await digiflazzClient.checkTransactionStatus({
					sku: tx.buyer_sku_code,
					customerNo: tx.customer_no,
					refId: tx.ref_id,
				});

				if (!statusRes) continue;

				const rc = statusRes.rc;
				const statusText = statusRes.status?.toLowerCase();
				const sn = statusRes.sn;
				const balanceAfter = statusRes.buyer_last_saldo;

				if (balanceAfter !== undefined && balanceAfter !== null) {
					balanceService.updateCachedDeposit(balanceAfter);
				}

				if (rc === '00' || statusText === 'sukses') {
					await supabaseClient.updateTransaction(tx.ref_id, {
						status: 'success',
						serial_number: sn ?? null,
						digiflazz_rc: rc,
						digiflazz_message: statusRes.message,
						digiflazz_response: statusRes as Record<string, unknown>,
						balance_after: balanceAfter ?? null,
					});

					await supabaseClient.updateOrderStatus(tx.order_id, {
						fulfillmentStatus: 'SUCCESS',
						serialNumber: sn,
					});

					reconciledCount++;
					logger.info('Reconciler resolved pending transaction to SUCCESS', {
						refId: tx.ref_id,
						orderId: tx.order_id,
						sn,
					});
				} else if (rc === '02' || statusText === 'gagal' || statusText === 'batal') {
					await supabaseClient.updateTransaction(tx.ref_id, {
						status: 'failed',
						digiflazz_rc: rc,
						digiflazz_message: statusRes.message,
						digiflazz_response: statusRes as Record<string, unknown>,
					});

					await supabaseClient.updateOrderStatus(tx.order_id, {
						fulfillmentStatus: 'FAILED',
					});

					reconciledCount++;
					logger.warn('Reconciler resolved pending transaction to FAILED', {
						refId: tx.ref_id,
						orderId: tx.order_id,
					});
				} else {
					// Masih pending, increment retry count
					await supabaseClient.updateTransaction(tx.ref_id, {
						retry_count: (tx.retry_count || 0) + 1,
						digiflazz_message: statusRes.message,
					});
				}
			} catch (txErr) {
				logger.error('Error reconciling individual transaction', { refId: tx.ref_id, error: txErr });
			}
		}

		return { reconciled: reconciledCount, total: pendingList.length };
	} catch (error) {
		logger.error('Reconciler batch execution failed', { error });
		return { reconciled: 0, total: 0 };
	}
}
