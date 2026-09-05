import { describe, test, expect, vi } from 'vitest';

/** Mocks */
vi.mock('../../../../../../src/network/http/common/constants.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../../src/network/http/common/constants.js')>();
    return {
        ...actual,
        MAX_BODY_LENGTH: 500,
    };
});

import EOFBodyReader from '../../../../../../src/network/http/request/body/EOFBodyReader.js';
import DynamicBuffer from '../../../../../../src/network/mem/DynamicBuffer.js';

/** A TCPConnection mock that returns `chunks` on successive `read()` calls, then null (EOF). */
function mockConn(...chunks: (Buffer | null)[]) {
    let i = 0;
    return {
        read: vi.fn(async () => i < chunks.length ? chunks[i++]! : null),
    } as any;
}

/** Reads every chunk from the reader until EOF and returns the concatenated body as a string. */
async function readAllAsString(reader: EOFBodyReader): Promise<string> {
    const out: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = await reader.read()) !== null) out.push(Buffer.from(chunk));
    return Buffer.concat(out).toString();
}

describe('EOFBodyReader', () => {

    describe('length', () => {
        test('should expose length = 0 to signal nothing is read at start', () => {
            const reader = new EOFBodyReader(mockConn(), new DynamicBuffer());
            expect(reader.length).toBe(0);
        });

        test('should increase the length after read', async () => {
            const reader = new EOFBodyReader(mockConn(Buffer.from('hello')), new DynamicBuffer());
            await reader.read();
            expect(reader.length).toBe(5);
        });

        test('should throw when body length exceeded from max body length threshold', async () => {
            const reader = new EOFBodyReader(mockConn(Buffer.from('x'.repeat(501))), new DynamicBuffer());
            await expect(reader.read()).rejects.toThrow('Body length exceeded the maximum number of bytes');
        });
    });

    describe('happy path', () => {
        test('should yield nothing and return null when the connection is already at EOF', async () => {
            const reader = new EOFBodyReader(mockConn(null), new DynamicBuffer());

            expect(await reader.read()).toBeNull();
        });

        test('should return the entire body as one chunk when it arrives in one read()', async () => {
            const reader = new EOFBodyReader(
                mockConn(Buffer.from('hello world')),
                new DynamicBuffer()
            );

            expect((await reader.read())?.toString()).toBe('hello world');
            expect(await reader.read()).toBeNull();
        });

        test('should concatenate body bytes that arrive across multiple reads', async () => {
            const reader = new EOFBodyReader(
                mockConn(
                    Buffer.from('hel'),
                    Buffer.from('lo '),
                    Buffer.from('world'),
                ),
                new DynamicBuffer()
            );

            expect(await readAllAsString(reader)).toBe('hello world');
        });

        test('should drain byte-by-byte across many small reads', async () => {
            const wire = Buffer.from('hello');
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));
            const reader = new EOFBodyReader(mockConn(...oneByteChunks), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('hello');
        });
    });

    describe('pre-buffered data', () => {
        test('should drain bytes already in the buffer before pulling from the connection', async () => {
            const reader = new EOFBodyReader(
                mockConn(Buffer.from('lo world')),
                new DynamicBuffer(Buffer.from('hel')),
            );

            expect(await readAllAsString(reader)).toBe('hello world');
        });

        test('should return null when the buffer is empty and the connection is at EOF', async () => {
            const reader = new EOFBodyReader(mockConn(null), new DynamicBuffer());

            expect(await reader.read()).toBeNull();
        });
    });

    describe('EOF semantics', () => {
        test('should return null on every subsequent read() after EOF', async () => {
            const reader = new EOFBodyReader(
                mockConn(Buffer.from('x')),
                new DynamicBuffer()
            );

            expect((await reader.read())?.toString()).toBe('x');
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
        });

        test('should call conn.read() exactly once beyond the body bytes (to discover EOF)', async () => {
            const conn = mockConn(Buffer.from('done'));
            const reader = new EOFBodyReader(conn, new DynamicBuffer());

            await readAllAsString(reader);
            expect(conn.read).toHaveBeenCalledTimes(2);

            await reader.read();
            await reader.read();
            expect(conn.read).toHaveBeenCalledTimes(2);
        });

        test('should ignore leftover bytes that arrive after the body is complete', async () => {
            const reader = new EOFBodyReader(
                mockConn(Buffer.from('body'), null),
                new DynamicBuffer()
            );

            expect((await reader.read())?.toString()).toBe('body');
            expect(await reader.read()).toBeNull();
        });
    });

    describe('yielded-buffer independence', () => {
        test('should return independent copies that survive subsequent reads', async () => {
            const reader = new EOFBodyReader(
                mockConn(Buffer.from('hello'), Buffer.from(' world')),
                new DynamicBuffer()
            );

            const first = await reader.read();
            const second = await reader.read();
            const third = await reader.read();

            expect(first?.toString()).toBe('hello');
            expect(second?.toString()).toBe(' world');
            expect(third).toBeNull();
        });
    });

    describe('empty body', () => {
        test('should yield no body bytes when the connection closes immediately', async () => {
            const reader = new EOFBodyReader(mockConn(null), new DynamicBuffer());

            expect(await readAllAsString(reader)).toBe('');
        });
    });
});
