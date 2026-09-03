import { describe, test, expect, vi } from 'vitest';
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
        test('should expose length = -1 to signal unknown body length', () => {
            const reader = new ChunkedBodyReader(mockConn(Buffer.from('0\r\n\r\n')), new DynamicBuffer());
            expect(reader.length).toBe(-1); // TODO: Fix this broken test
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
            // Two consecutive data chunks of 5 bytes each: "hello" and "world".
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

    describe('chunk extensions', () => {
        test('should report no extensions when none are present', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([]);
        });

        test('should parse a single name=value extension', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext=foo\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'ext', value: 'foo'}]);
        });

        test('should parse multiple extensions in order', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;a=1;b=2;c=3\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([
                {name: 'a', value: '1'},
                {name: 'b', value: '2'},
                {name: 'c', value: '3'},
            ]);
        });

        test('should parse bare-name extensions with null value', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;flag\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'flag', value: null}]);
        });

        test('should allow whitespace around the ; separator (SP and HTAB)', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5; ext = foo \r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'ext', value: 'foo'}]);
        });

        test('should parse a quoted-string value with embedded spaces', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext="hello world"\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'ext', value: 'hello world'}]);
        });

        test('should unescape \\" inside a quoted-string value', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext="a\\"b"\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'ext', value: 'a"b'}]);
        });

        test('should allow an empty quoted-string value', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext=""\r\nhello\r\n0\r\n\r\n')),
                new DynamicBuffer()
            );

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'ext', value: ''}]);
        });

        test('should replace extensions on each chunk-size read', async () => {
            const wire = Buffer.from('5;a=1\r\nhello\r\n3;b=2\r\nfoo\r\n0\r\n\r\n');
            const reader = new ChunkedBodyReader(mockConn(wire), new DynamicBuffer());

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'a', value: '1'}]);

            await reader.read();
            expect(reader.extensions).toEqual([{name: 'b', value: '2'}]);

            await reader.read();
            expect(reader.extensions).toEqual([]);
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
            // MAX_CHUNK_SIZE = 64 * 1024 * 1000 = 65,536,000 (~ 0x3E80000).
            // 0x40000000 = 1,073,741,824, well over the limit.
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('40000000\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Exceeded chunk size');
        });
    });

    describe('chunk-extension errors', () => {
        test('should throw on an empty extension name', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;=foo\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Invalid chunk extension name');
        });

        test('should throw on an empty bare value (token expected after =)', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext=\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Invalid chunk extension value');
        });

        test('should throw on an unterminated quoted-string', async () => {
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5;ext="abc\r\n')),
                new DynamicBuffer()
            );

            await expect(reader.read()).rejects.toThrow('Unterminated quoted-string');
        });
    });

    describe('framing errors', () => {
        test('should throw on missing CRLF after chunk data', async () => {
            // chunk1 = "hello" (5), no CRLF after data, then size line for terminator.
            const reader = new ChunkedBodyReader(
                mockConn(Buffer.from('5\r\nhello0\r\n\r\n')),
                new DynamicBuffer()
            );

            // First read yields the chunk payload; the framing error surfaces
            // when the generator tries to skip the trailing CRLF on the next step.
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

            // First read yields the partial chunk we already received.
            const partial = await reader.read();
            expect(partial?.toString()).toBe('he');

            // Second read needs the remaining 3 bytes, hits EOF, throws.
            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading chunk data');
        });
    });
});
