export interface DigiflazzPriceItem {
	product_name: string;
	category: string;
	brand: string;
	type: string;
	seller_name: string;
	price: number;
	buyer_sku_code: string;
	buyer_product_status: boolean;
	seller_product_status: boolean;
	unlimited_stock: boolean;
	stock: number;
	multi: boolean;
	start_cut_off: string;
	end_cut_off: string;
	desc: string;
}

export interface DigiflazzPriceListResponse {
	data?: DigiflazzPriceItem[];
	rc?: string;
	message?: string;
}

export interface DigiflazzBalanceResponse {
	data?: {
		deposit: number;
	};
	rc?: string;
	message?: string;
}

export interface DigiflazzTransactionRequest {
	username: string;
	buyer_sku_code: string;
	customer_no: string;
	ref_id: string;
	sign: string;
	testing?: boolean;
	cb_url?: string;
	allow_dot?: boolean;
}

export interface DigiflazzTransactionResponse {
	data?: {
		ref_id: string;
		customer_no: string;
		buyer_sku_code: string;
		message: string;
		status: string; // 'Sukses' | 'Pending' | 'Gagal'
		rc: string; // '00' = Sukses, '01' = Pending, '02' = Gagal / Batal, '03' = Menunggu Pembayaran
		sn?: string;
		buyer_last_saldo?: number;
		price?: number;
		tele?: string;
		wa?: string;
	};
	rc?: string;
	message?: string;
}

export interface DigiflazzDepositTicketRequest {
	amount: number;
	bank: string;
	ownerName: string;
}

export interface DigiflazzDepositTicketData {
	rc: string;
	bank: string;
	payment_method: string;
	account_no: string;
	notes: string;
	amount: number;
	expires_at: string;
	message?: string;
}

export interface DigiflazzDepositTicketResponse {
	data?: DigiflazzDepositTicketData;
	rc?: string;
	message?: string;
}
