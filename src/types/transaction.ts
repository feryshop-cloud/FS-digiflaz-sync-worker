export type TransactionStatus = 'pending' | 'success' | 'failed' | 'unknown';

export interface ExecuteTransactionParams {
	orderId: string;
	sku: string;
	customerNo: string;
	amount?: number;
	testing?: boolean;
}

export interface DigiflazzTransactionRecord {
	id?: string;
	order_id: string;
	ref_id: string;
	buyer_sku_code: string;
	customer_no: string;
	amount: number;
	status: TransactionStatus;
	serial_number?: string | null;
	digiflazz_rc?: string | null;
	digiflazz_message?: string | null;
	digiflazz_response?: Record<string, unknown> | null;
	balance_before?: number | null;
	balance_after?: number | null;
	retry_count?: number;
	created_at?: string;
	updated_at?: string;
}

export interface ExecuteTransactionResult {
	ok: boolean;
	status: TransactionStatus;
	refId: string;
	orderId: string;
	serialNumber?: string;
	rc?: string;
	message: string;
	balanceBefore?: number;
	balanceAfter?: number;
}
