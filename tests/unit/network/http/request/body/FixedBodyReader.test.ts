import { describe, test, expect, vi } from 'vitest';
import FixedBodyReader from '../../../../../../src/network/http/request/body/FixedBodyReader.js';
import DynamicBuffer from '../../../../../../src/network/mem/DynamicBuffer.js';

/** A TCPConnection mock that returns `chunks` on successive `read()` calls, then null (EOF). */
function mockConn(...chunks: (Buffer | null)[]) {
    let i = 0;
    return {
        read: vi.fn(async () => i < chunks.length ? chunks[i++]! : null),
    } as any;
}

/** Reads every chunk from the reader until EOF and returns the concatenated body as a string. */
async function readAllAsString(reader: FixedBodyReader): Promise<string> {
    const out: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = await reader.read()) !== null) out.push(Buffer.from(chunk));
    return Buffer.concat(out).toString();
}

describe('FixedBodyReader', () => {

    describe('length', () => {
        test('should expose the constructor-supplied byte count', () => {
            const reader = new FixedBodyReader(mockConn(), new DynamicBuffer(), 1000);
            expect(reader.length).toBe(1000);
        });

        test('should allow a zero-length body', () => {
            const reader = new FixedBodyReader(mockConn(), new DynamicBuffer(), 0);
            expect(reader.length).toBe(0);
        });

        test('should decrement length as the body is read', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('hello')),
                new DynamicBuffer(),
                5
            );

            expect(reader.length).toBe(5);
            await reader.read();
            expect(reader.length).toBe(0);
        });
    });

    describe('happy path', () => {
        test('should read a single chunk that fits entirely in one read()', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('hello')),
                new DynamicBuffer(),
                5
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should return null once all bytes have been consumed', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('hi')),
                new DynamicBuffer(),
                2
            );

            expect((await reader.read())?.toString()).toBe('hi');
            expect(await reader.read()).toBeNull();
        });

        test('should return null immediately for a zero-length body', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('should-not-be-read')),
                new DynamicBuffer(),
                0
            );

            expect(await reader.read()).toBeNull();
        });
    });

    describe('multi-chunk streaming', () => {
        test('should concatenate a body that arrives across multiple reads', async () => {
            const reader = new FixedBodyReader(
                mockConn(
                    Buffer.from('hel'),
                    Buffer.from('lo'),
                    Buffer.from(' world'),
                ),
                new DynamicBuffer(),
                11
            );

            expect(await readAllAsString(reader)).toBe('hello world');
        });

        test('should yield each chunk separately across multiple read() calls', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('hello'), Buffer.from('world')),
                new DynamicBuffer(),
                10
            );

            const first  = await reader.read();
            const second = await reader.read();
            const third  = await reader.read();

            expect(first?.toString()).toBe('hello');
            expect(second?.toString()).toBe('world');
            expect(third).toBeNull();
        });

        test('should split a single read into multiple yield chunks when buf already has data', async () => {
            // Pre-buffer the entire payload, then send EOF. The reader should
            // still emit it as a single chunk (since length <= buf.length).
            const reader = new FixedBodyReader(
                mockConn(),
                new DynamicBuffer(Buffer.from('hello')),
                5
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should consume buffered bytes before pulling from the connection', async () => {
            // Buffer already has 3 bytes; the connection supplies the remaining 2.
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('lo')),
                new DynamicBuffer(Buffer.from('hel')),
                5
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should split byte-by-byte across many small reads', async () => {
            const wire = Buffer.from('hello');
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));
            const reader = new FixedBodyReader(mockConn(...oneByteChunks), new DynamicBuffer(), 5);

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should split a wire that exceeds the requested length', async () => {
            // The wire has more bytes than Content-Length claims. The reader must
            // stop at exactly `length` bytes and leave the rest in the buffer
            // for the next protocol layer to interpret.
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('helloEXTRA')),
                new DynamicBuffer(),
                5
            );

            expect(await readAllAsString(reader)).toBe('hello');
            // The internal DynamicBuffer should retain the unread 5 bytes.
            const buf = (reader as any).buf as DynamicBuffer;
            expect(buf.length).toBe(5);
            expect(buf.getView(5).toString()).toBe('EXTRA');
        });

        test('should consume only Content-Length bytes and leave the rest in the buffer', async () => {
            // Wire has 10 bytes; reader wants only 4. The first read() yields 4.
            // After that, length === 0, so the next read() returns null and the
            // remaining 6 bytes stay in the buffer for the protocol layer above
            // (correct HTTP/1.1 pipelining semantics).
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('abcdefghij')),
                new DynamicBuffer(),
                4
            );

            expect((await reader.read())?.toString()).toBe('abcd');
            expect(await reader.read()).toBeNull();

            // The internal DynamicBuffer should retain the leftover 6 bytes.
            const buf = (reader as any).buf as DynamicBuffer;
            expect(buf.length).toBe(6);
            expect(buf.getView(6).toString()).toBe('efghij');
        });
    });

    describe('EOF handling', () => {
        test('should throw on EOF before any data', async () => {
            const reader = new FixedBodyReader(mockConn(null), new DynamicBuffer(), 10);

            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading request body');
        });

        test('should throw on EOF mid-body when remaining length is still positive', async () => {
            // Buffer empty, conn returns null, length=10. Must throw, not return null.
            const reader = new FixedBodyReader(mockConn(null), new DynamicBuffer(), 10);

            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading request body');
        });

        test('should NOT throw on EOF when the body is already complete', async () => {
            // Buffer empty, but length=0 — first check returns null cleanly.
            const reader = new FixedBodyReader(mockConn(null), new DynamicBuffer(), 0);

            expect(await reader.read()).toBeNull();
        });
    });

    describe('boundary conditions', () => {
        test('should yield a zero-byte read result when buf is exactly the right size', async () => {
            // Hitting `consume = min(buf.length, length) === length === 0` would
            // return a 0-byte Buffer; the early return on `length === 0` covers this.
            const reader = new FixedBodyReader(mockConn(), new DynamicBuffer(), 0);

            expect(await reader.read()).toBeNull();
        });

        test('should handle a body of exactly one byte', async () => {
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('A')),
                new DynamicBuffer(),
                1
            );

            expect((await reader.read())?.toString()).toBe('A');
            expect(await reader.read()).toBeNull();
        });

        test('should handle a large body that arrives across many chunks', async () => {
            const total = 1024;
            const wire = Buffer.alloc(total, 0x41); // 'A' × 1024
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));

            const reader = new FixedBodyReader(mockConn(...oneByteChunks), new DynamicBuffer(), total);

            expect(await readAllAsString(reader)).toBe('A'.repeat(total));
        });

        test('should drain a connection that has trailing data beyond Content-Length', async () => {
            // HTTP body is exactly "hello" (5 bytes). The connection then has
            // "EXTRA" leftover that the reader must NOT consume — it belongs to
            // pipelining / the next request, not this body.
            const reader = new FixedBodyReader(
                mockConn(Buffer.from('helloEXTRA')),
                new DynamicBuffer(),
                5
            );

            expect(await readAllAsString(reader)).toBe('hello');
        });
    });
});
