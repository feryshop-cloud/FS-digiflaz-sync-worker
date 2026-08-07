// Minimal pure-TS MD5 (Cloudflare Workers: WebCrypto tidak menyediakan MD5).
// Implementasi referensi RFC 1321 (diringkas, cukup untuk sign Digiflazz).

const S: number[] = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11,
	16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const K: number[] = [
	0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8, 0x8b44f7af, 0xffff5bb1,
	0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453,
	0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942,
	0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
	0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d,
	0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function rotl(x: number, c: number): number {
	return ((x << c) | (x >>> (32 - c))) >>> 0;
}

function toBytes(input: string): number[] {
	const encoded = new TextEncoder().encode(input);
	return Array.from(encoded);
}

export function md5hex(input: string): string {
	let bytes = toBytes(input);

	// padding
	const bitLen = bytes.length * 8;
	const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
	const padded = new Array<number>(paddedLen).fill(0);
	for (let i = 0; i < bytes.length; i++) padded[i] = bytes[i];
	padded[bytes.length] = 0x80;
	// little-endian 64-bit length
	let idx = paddedLen - 8;
	padded[idx] = bitLen & 0xff;
	padded[idx + 1] = (bitLen >>> 8) & 0xff;
	padded[idx + 2] = (bitLen >>> 16) & 0xff;
	padded[idx + 3] = (bitLen >>> 24) & 0xff;
	// tinggi (32-bit atas) = 0

	let a0 = 0x67452301;
	let b0 = 0xefcdab89;
	let c0 = 0x98badcfe;
	let d0 = 0x10325476;

	for (let chunkStart = 0; chunkStart < paddedLen; chunkStart += 64) {
		const M: number[] = new Array(16).fill(0);
		for (let j = 0; j < 16; j++) {
			const off = chunkStart + j * 4;
			M[j] = padded[off] | (padded[off + 1] << 8) | (padded[off + 2] << 16) | (padded[off + 3] << 24);
		}

		let A = a0;
		let B = b0;
		let C = c0;
		let D = d0;

		for (let i = 0; i < 64; i++) {
			let F: number;
			let g: number;
			if (i < 16) {
				F = (B & C) | (~B & D);
				g = i;
			} else if (i < 32) {
				F = (D & B) | (~D & C);
				g = (5 * i + 1) % 16;
			} else if (i < 48) {
				F = B ^ C ^ D;
				g = (3 * i + 5) % 16;
			} else {
				F = C ^ (B | ~D);
				g = (7 * i) % 16;
			}
			F = (F + A + K[i] + M[g]) >>> 0;
			A = D;
			D = C;
			C = B;
			B = (B + rotl(F, S[i])) >>> 0;
		}

		a0 = (a0 + A) >>> 0;
		b0 = (b0 + B) >>> 0;
		c0 = (c0 + C) >>> 0;
		d0 = (d0 + D) >>> 0;
	}

	const hex = (n: number): string => {
		const parts: string[] = [];
		for (let i = 0; i < 4; i++) {
			parts.push(((n >>> (i * 8)) & 0xff).toString(16).padStart(2, '0'));
		}
		return parts.join('');
	};
	return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}
