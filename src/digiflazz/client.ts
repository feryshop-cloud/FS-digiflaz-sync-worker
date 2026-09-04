import { md5hex } from '../lib/md5';
import { logger } from '../lib/logger';
import { config } from '../config';
import type {
	DigiflazzPriceItem,
	DigiflazzPriceListResponse,
	DigiflazzBalanceResponse,
	DigiflazzTransactionResponse,
} from '../types/digiflazz';
import dummyData from '../../dummy.json';

export class DigiflazzClient {
	private username: string;
	private apiKey: string;
	private baseUrl: string;
	private useDummy: boolean;

	constructor() {
		this.username = config.digiflazz.username;
		this.apiKey = config.digiflazz.apiKey;
		this.baseUrl = config.digiflazz.baseUrl;
		this.useDummy = config.digiflazz.useDummy;
	}

	/**
	 * Mengambil daftar harga produk dari Digiflazz API atau fallback dummy.
	 * Sign: md5(username + apiKey + "pricelist")
	 */
	async fetchPriceList(): Promise<DigiflazzPriceItem[]> {
		if (this.useDummy) {
			logger.info('DIGIFLAZZ_USE_DUMMY=true, using dummy.json');
			if (Array.isArray(dummyData)) return dummyData as DigiflazzPriceItem[];
			return (dummyData as { data?: DigiflazzPriceItem[] }).data ?? [];
		}

		if (!this.username || !this.apiKey) {
			throw new Error('Digiflazz credentials (username/apiKey) not configured');
		}

		const sign = md5hex(this.username + this.apiKey + 'pricelist');
		const response = await fetch(`${this.baseUrl}/price-list`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cmd: 'prepaid',
				username: this.username,
				sign,
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Digiflazz price-list HTTP ${response.status}: ${body}`);
		}

		const json = (await response.json()) as DigiflazzPriceListResponse;
		if (json.rc && json.rc !== '00') {
			throw new Error(`Digiflazz price-list rc=${json.rc}: ${json.message}`);
		}
		if (!Array.isArray(json.data)) {
			throw new Error('Digiflazz price-list response missing data array');
		}
		return json.data;
	}

	/**
	 * Cek saldo deposit Digiflazz.
	 * Sign: md5(username + apiKey + "depo")
	 */
	async checkBalance(): Promise<{ deposit: number; raw?: unknown }> {
		if (this.useDummy) {
			logger.info('DIGIFLAZZ_USE_DUMMY=true, returning mock balance');
			return { deposit: 10_000_000 };
		}

		if (!this.username || !this.apiKey) {
			throw new Error('Digiflazz credentials (username/apiKey) not configured');
		}

		const sign = md5hex(this.username + this.apiKey + 'depo');
		const response = await fetch(`${this.baseUrl}/cek-saldo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cmd: 'deposit',
				username: this.username,
				sign,
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Digiflazz cek-saldo HTTP ${response.status}: ${body}`);
		}

		const json = (await response.json()) as DigiflazzBalanceResponse;
		if (json.rc && json.rc !== '00') {
			throw new Error(`Digiflazz cek-saldo rc=${json.rc}: ${json.message}`);
		}

		const deposit = json.data?.deposit ?? 0;
		return { deposit, raw: json };
	}

	/**
	 * Melakukan eksekusi transaksi ke Digiflazz API.
	 * Sign: md5(username + apiKey + ref_id)
	 */
	async createTransaction(params: {
		sku: string;
		customerNo: string;
		refId: string;
		testing?: boolean;
		cbUrl?: string;
	}): Promise<DigiflazzTransactionResponse['data']> {
		if (this.useDummy) {
			logger.info('DIGIFLAZZ_USE_DUMMY=true, returning mock transaction response', {
				refId: params.refId,
				sku: params.sku,
			});
			return {
				ref_id: params.refId,
				customer_no: params.customerNo,
				buyer_sku_code: params.sku,
				message: 'TRANSAKSI SUKSES (MOCK)',
				status: 'Sukses',
				rc: '00',
				sn: `SN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
				buyer_last_saldo: 9_950_000,
			};
		}

		if (!this.username || !this.apiKey) {
			throw new Error('Digiflazz credentials (username/apiKey) not configured');
		}

		const sign = md5hex(this.username + this.apiKey + params.refId);
		const payload: Record<string, unknown> = {
			username: this.username,
			buyer_sku_code: params.sku,
			customer_no: params.customerNo,
			ref_id: params.refId,
			sign,
		};

		if (params.testing !== undefined) {
			payload.testing = params.testing;
		}
		if (params.cbUrl) {
			payload.cb_url = params.cbUrl;
		}

		const response = await fetch(`${this.baseUrl}/transaction`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const body = await response.text();
			throw new Error(`Digiflazz transaction HTTP ${response.status}: ${body}`);
		}

		const json = (await response.json()) as DigiflazzTransactionResponse;
		if (!json.data) {
			throw new Error(`Digiflazz transaction missing data (rc=${json.rc}, message=${json.message})`);
		}
		return json.data;
	}

	/**
	 * Cek status transaksi pending di Digiflazz menggunakan ref_id yang sama.
	 * Di Digiflazz, mengirim request dengan ref_id yang sama bersifat idempoten dan mengembalikan status transaksi tersebut.
	 */
	async checkTransactionStatus(params: { sku: string; customerNo: string; refId: string }): Promise<DigiflazzTransactionResponse['data']> {
		return this.createTransaction({
			sku: params.sku,
			customerNo: params.customerNo,
			refId: params.refId,
		});
	}
}

export const digiflazzClient = new DigiflazzClient();
