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

export interface SupabaseProductRow {
	game_slug: string;
	brand?: string | null;
	category?: string | null;
}

export interface SyncRow {
	title: string;
	selling_price: number;
	game_slug: string;
	brand: string;
	category_id: number | null;
	description: string;
	start_cut_off: string;
	end_cut_off: string;
	is_active: boolean;
	sku: string;
	provider: string;
	provider_ref: string;
}
