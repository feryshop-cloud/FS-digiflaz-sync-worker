export interface GameRow {
	slug: string;
	name?: string | null;
	code?: string | null;
}

export interface CategoryRow {
	id: number;
	title: string;
	slug?: string | null;
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

export interface SyncResult {
	upserted: number;
	skipped: number;
	stale: number;
}
