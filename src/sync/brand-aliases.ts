/** Normalisasi brand Digiflazz -> slug game (lowercase, spasi -> dash). */
export function brandToSlug(brand: string): string {
	return (brand || '')
		.trim()
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-');
}

export const BRAND_ALIASES: Record<string, string> = {
	'call of duty mobile': 'call-of-duty-mobile',
	codm: 'call-of-duty-mobile',
	'honor of kings': 'honor-of-kings',
	hok: 'honor-of-kings',
	'point blank': 'point-blank',
	pb: 'point-blank',
	'mobile legends': 'mobile-legends',
	'mobile legends: bang bang': 'mobile-legends',
	mlbb: 'mobile-legends',
	'free fire': 'free-fire',
	ff: 'free-fire',
	'free fire max': 'free-fire-max',
	ffm: 'free-fire-max',
	'pubg mobile': 'pubg-mobile',
	pubgm: 'pubg-mobile',
	valorant: 'valorant',
	'genshin impact': 'genshin-impact',
	'sausage man': 'sausage-man',
	'magic chess': 'magic-chess',
	'fc mobile': 'fc-mobile',
	'metal slug awakening': 'metal-slug-awakening',
	'war robots': 'war-robots',
	'blood strike': 'blood-strike',
};
