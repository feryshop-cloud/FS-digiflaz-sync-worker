export interface AppConfig {
	port: number;
	nodeEnv: string;
	digiflazz: {
		username: string;
		apiKey: string;
		baseUrl: string;
		useDummy: boolean;
		minReserve: number;
	};
	supabase: {
		url: string;
		serviceRoleKey: string;
	};
	auth: {
		serviceApiKey: string;
		syncSecret: string;
	};
	sync: {
		staleGuardRatio: number;
	};
}

export function loadConfig(): AppConfig {
	const nodeEnv = process.env.NODE_ENV || 'development';
	const port = Number(process.env.PORT) || 3002;
	const useDummy = process.env.DIGIFLAZZ_USE_DUMMY === 'true' || process.env.DIGIFLAZZ_USE_DUMMY === '1' || nodeEnv === 'test';

	return {
		port,
		nodeEnv,
		digiflazz: {
			username: process.env.DIGIFLAZZ_USERNAME || '',
			apiKey: process.env.DIGIFLAZZ_API_KEY || '',
			baseUrl: process.env.DIGIFLAZZ_BASE_URL || 'https://api.digiflazz.com/v1',
			useDummy,
			minReserve: Number(process.env.DIGIFLAZZ_MIN_RESERVE) || 50000,
		},
		supabase: {
			url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
			serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
		},
		auth: {
			serviceApiKey: process.env.DIGIFLAZZ_SERVICE_API_KEY || '',
			syncSecret: process.env.SYNC_SECRET || process.env.DIGIFLAZZ_SERVICE_API_KEY || '',
		},
		sync: {
			staleGuardRatio: Number(process.env.STALE_GUARD_RATIO) || 0.3,
		},
	};
}

export const config = loadConfig();
