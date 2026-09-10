import { describe, test, expect, vi } from 'vitest';

/** Mocks */
vi.mock('../../../../../../src/network/http/common/constants.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../../src/network/http/common/constants.js')>();
    return {
        ...actual,
        MAX_BODY_LENGTH: 500,
    };
});

import MemoryBodyReader from '../../../../../../src/network/http/request/body/MemoryBodyReader.js';

describe('MemoryBodyReader', () => {

    describe('length', () => {
        test('should expose the size of the underlying buffer at construction', () => {
            const reader = new MemoryBodyReader(Buffer.from('hello'));
            expect(reader.length).toBe(5);
        });

        test('should expose length = 0 for an empty buffer', () => {
            const reader = new MemoryBodyReader(Buffer.alloc(0));
            expect(reader.length).toBe(0);
        });

        test('should keep length unchanged across reads (readers do not shrink)', async () => {
            const reader = new MemoryBodyReader(Buffer.from('hello'));
            await reader.read();
            expect(reader.length).toBe(5);
        });

        test('should throw when initial body length exceeds max body length threshold', () => {
            expect(() => new MemoryBodyReader(Buffer.from('x'.repeat(501))))
                .toThrow('Body length exceeded the maximum number of bytes');
        });
    });

    describe('happy path', () => {
        test('should return the full buffer on the first read()', async () => {
            const reader = new MemoryBodyReader(Buffer.from('hello'));

            expect((await reader.read())?.toString()).toBe('hello');
        });

        test('should return null on every subsequent read()', async () => {
            const reader = new MemoryBodyReader(Buffer.from('hello'));

            expect((await reader.read())?.toString()).toBe('hello');
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
        });

        test('should preserve binary content byte-for-byte', async () => {
            const payload = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0x80]);
            const reader = new MemoryBodyReader(payload);

            const out = await reader.read();
            expect(out).toEqual(payload);
        });

        test('should handle a buffer that fits exactly at the max body length threshold', async () => {
            // Mocked MAX_BODY_LENGTH = 500; a 500-byte buffer should NOT throw.
            const data = Buffer.alloc(500, 0x41); // 'A' × 500
            const reader = new MemoryBodyReader(data);

            const out = await reader.read();
            expect(out?.length).toBe(500);
            expect(out?.toString()).toBe('A'.repeat(500));
        });
    });

    describe('body content', () => {
        test('should return the same Buffer reference supplied at construction', async () => {
            // MemoryBodyReader owns no separate buffer to copy from — the caller-supplied
            // Buffer is returned as-is on read(). This matches its in-memory adapter role.
            const data = Buffer.from('payload');
            const reader = new MemoryBodyReader(data);

            expect(await reader.read()).toBe(data);
        });

        test('should support large bodies within the threshold', async () => {
            const data = Buffer.alloc(400, 0x42); // 'B' × 400
            const reader = new MemoryBodyReader(data);

            const out = await reader.read();
            expect(out?.length).toBe(400);
            expect(out?.toString()).toBe('B'.repeat(400));
        });

        test('should handle UTF-8 multi-byte content without corruption', async () => {
            const text = 'héllo 🌍 wörld';
            const reader = new MemoryBodyReader(Buffer.from(text, 'utf8'));

            expect((await reader.read())?.toString('utf8')).toBe(text);
        });
    });

    describe('EOF semantics', () => {
        test('should signal EOF immediately for an empty buffer', async () => {
            const reader = new MemoryBodyReader(Buffer.alloc(0));

            // First read must surface the empty buffer, not null — the body IS the
            // zero-byte Buffer; null would mean the reader is exhausted.
            const first = await reader.read();
            expect(first).not.toBeNull();
            expect(first?.length).toBe(0);

            expect(await reader.read()).toBeNull();
        });

        test('should never throw on read() (no upstream to fail)', async () => {
            const reader = new MemoryBodyReader(Buffer.from('hi'));

            // Ten reads in a row must all settle cleanly.
            for (let i = 0; i < 10; i++) {
                await expect(reader.read()).resolves.toBeDefined();
            }
        });

        test('should not advance length on EOF reads', async () => {
            const reader = new MemoryBodyReader(Buffer.from('done'));
            await reader.read();
            const lenAfterFirst = reader.length;
            await reader.read();
            await reader.read();
            expect(reader.length).toBe(lenAfterFirst);
        });
    });

    describe('construction-time validation', () => {
        test('should throw at construction when buffer exceeds the threshold', () => {
            // The constructor checks the threshold eagerly, so even calling read()
            // is never reached.
            expect(() => new MemoryBodyReader(Buffer.from('x'.repeat(1000))))
                .toThrow('Body length exceeded the maximum number of bytes');
        });

        test('should accept a buffer at exactly the threshold', () => {
            expect(() => new MemoryBodyReader(Buffer.alloc(500))).not.toThrow();
        });

        test('should accept a buffer just under the threshold', () => {
            expect(() => new MemoryBodyReader(Buffer.alloc(499))).not.toThrow();
        });
    });

    describe('boundary conditions', () => {
        test('should handle a body of exactly one byte', async () => {
            const reader = new MemoryBodyReader(Buffer.from('A'));

            expect((await reader.read())?.toString()).toBe('A');
            expect(await reader.read()).toBeNull();
        });

        test('should handle a buffer full of zero bytes', async () => {
            const data = Buffer.alloc(64, 0x00);
            const reader = new MemoryBodyReader(data);

            const out = await reader.read();
            expect(out?.length).toBe(64);
            expect(out?.equals(data)).toBe(true);
        });

        test('should yield independent reads across multiple instances with the same payload', async () => {
            const payload = Buffer.from('shared');
            const r1 = new MemoryBodyReader(payload);
            const r2 = new MemoryBodyReader(payload);

            const a = await r1.read();
            const b = await r2.read();
            expect(a?.toString()).toBe('shared');
            expect(b?.toString()).toBe('shared');
            // Both readers independently advance to null after one read.
            expect(await r1.read()).toBeNull();
            expect(await r2.read()).toBeNull();
        });
    });
});
