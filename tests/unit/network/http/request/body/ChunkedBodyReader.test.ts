import { describe, test, expect, vi } from 'vitest';

/** Mocks */
vi.mock('../../../../../../src/network/http/common/constants.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../../src/network/http/common/constants.js')>();
    return {
        ...actual,
        MAX_BODY_LENGTH: 500,
    };
});

import ChunkedBodyReader from '../../../../../../src/network/http/request/body/ChunkedBodyReader.js';
import DynamicBuffer from '../../../../../../src/network/mem/DynamicBuffer.js';

/** A TCPConnection mock that returns `chunks` on successive `read()` calls, then null (EOF). */
function mockConn(...chunks: (Buffer | null)[]) {
    let i = 0;
    return {
        read: vi.fn(async () => i < chunks.length ? chunks[i++]! : null),
    } as any;
}

/** Reads every chunk from the reader until EOF and returns the concatenated body as a string. */
async function readAllAsString(reader: ChunkedBodyReader): Promise<string> {
    const out: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = await reader.read()) !== null) out.push(Buffer.from(chunk));
    return Buffer.concat(out).toString();
}

describe('ChunkedBodyReader', () => {

    describe('length', () => {
        test('should expose length = 0 to signal nothing is read at start', () => {
            const reader = new ChunkedBodyReader(mockConn(Buffer.from('0\r\n\r\n')), new DynamicBuffer());
            expect(reader.length).toBe(0);
        });

        test('should increase the length after read', async () => {
           const reader = new ChunkedBodyReader(mockConn(Buffer.from('5\r\nhello\r\n0\r\n\r\n')), new DynamicBuffer());
           await reader.read();
           expect(reader.length).toBe(5);
        });

        test('should throw when body length exceeded from max body length threshold', async () => {
            const reader = new ChunkedBodyReader(mockConn(Buffer.from('1f5\r\n' + 'x'.repeat(501) + '\r\n0\r\n\r\n')), new DynamicBuffer());
            await expect(reader.read()).rejects.toThrow('Body length exceeded the maximum number of bytes');
        });
    });

    describe('happy path', () => {
        test('should concatenate a multi-chunk body into the original payload', async () => {
            const wire = Buffer.from('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('Wikipedia');
        });

        test('should yield each chunk separately across multiple read() calls', async () => {
            const wire = Buffer.from('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            const first  = await reader.read();
            const second = await reader.read();
            const third  = await reader.read();

            expect(first?.toString()).toBe('Wiki');
            expect(second?.toString()).toBe('pedia');
            expect(third).toBeNull();
        });

        test('should concatenate consecutive data chunks separated by terminators', async () => {
            const wire = Buffer.from('5\r\nhello\r\n5\r\nworld\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('helloworld');
        });

        test('should handle a body with no data chunks (only the terminator)', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('0\r\n\r\n')),
                new DynamicBuffer()
            );

            expect(await readAllAsString(reader)).toBe('');
        });

        test('should handle uppercase and lowercase hex sizes', async () => {
            const wire = Buffer.from('a\r\n0123456789\r\nFF\r\n' + 'A'.repeat(255) + '\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('0123456789' + 'A'.repeat(255));
        });

        test('should handle leading-zero hex sizes', async () => {
            const wire = Buffer.from('00ff\r\n' + 'x'.repeat(255) + '\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('x'.repeat(255));
        });
    });

    describe('streaming across read() boundaries', () => {
        test('should split a chunk-size line across two reads', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(
                    Buffer.from('5\r'),
                    Buffer.from('\nhello\r\n0\r\n\r\n'),
                ),
                new DynamicBuffer()
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should split a chunk-data payload across multiple reads', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(
                    Buffer.from('5\r\nhe'),
                    Buffer.from('llo\r\n0\r\n\r\n'),
                ),
                new DynamicBuffer()
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should split byte-by-byte across many small reads', async () => {
            const wire = Buffer.from('5\r\nhello\r\n0\r\n\r\n');
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));
            const reader = new ChunkedBodyReader(mockConn(...oneByteChunks), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('hello');
        });
    });

    describe('chunk-size errors', () => {
        test('should throw on non-hex size characters', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('XYZ\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Invalid chunk size');
        });

        test('should throw on negative hex size', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('-1\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Invalid chunk size');
        });

        test('should throw on empty size (line is only extensions)', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from(';ext=foo\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Invalid chunk size');
        });

        test('should throw when size exceeds MAX_CHUNK_SIZE', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('40000000\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Exceeded chunk size');
        });
    });

    describe('framing errors', () => {
        test('should throw on missing CRLF after chunk data', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5\r\nhello0\r\n\r\n')),
                new DynamicBuffer()
            );

            const first = await reader.read();
            expect(first?.toString()).toBe('hello');
            await expect(reader.read()).rejects.toThrow('Invalid chunk framing');
        });
    });

    describe('EOF handling', () => {
        test('should throw on EOF before any data', async () => {
            const reader = new ChunkedBodyReader(mockConn(null), new DynamicBuffer());

            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading chunk data');
        });

        test('should throw on EOF mid-chunk-data', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5\r\nhe')),
                new DynamicBuffer()
            );

            const partial = await reader.read();
            expect(partial?.toString()).toBe('he');

            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading chunk data');
        });
    });
});
