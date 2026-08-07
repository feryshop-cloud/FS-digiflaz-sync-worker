import { describe, it, expect } from 'vitest';
import { md5hex } from '../src/md5';

describe('md5hex', () => {
	it('known vectors', () => {
		expect(md5hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
		expect(md5hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
		expect(md5hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
		expect(md5hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
		expect(md5hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
	});
});
