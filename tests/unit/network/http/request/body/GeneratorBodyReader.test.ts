import { describe, test, expect, vi } from 'vitest';

/** Mocks */
vi.mock('../../../../../../src/network/http/common/constants.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../../../src/network/http/common/constants.js')>();
    return {
        ...actual,
        MAX_BODY_LENGTH: 500,
    };
});

import GeneratorBodyReader from '../../../../../../src/network/http/request/body/GeneratorBodyReader.js';
import {BufferGenerator} from '../../../../../../src/network/http/common/types.js';

/** An async generator that yields the given buffers in order, then ends. */
async function* fromChunks(...chunks: Buffer[]): BufferGenerator {
    for (const c of chunks) yield c;
}

/** An async generator that yields nothing and returns immediately. */
async function* empty(): BufferGenerator {
    if (false as boolean) yield Buffer.alloc(0);
}

/** Reads every chunk from the reader until EOF and returns the concatenated body as a string. */
async function readAllAsString(reader: GeneratorBodyReader): Promise<string> {
    const out: Buffer[] = [];
    let chunk: Buffer | null;
    while ((chunk = await reader.read()) !== null) out.push(Buffer.from(chunk));
    return Buffer.concat(out).toString();
}

describe('GeneratorBodyReader', () => {

    describe('length', () => {
        test('should expose length = 0 to signal nothing has been read yet', () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('hello')));
            expect(reader.length).toBe(0);
        });

        test('should increase the length by the size of a yielded chunk', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('hello'), Buffer.from(' world')));
            await reader.read();
            expect(reader.length).toBe(5);
        });

        test('should accumulate length across multiple reads', async () => {
            const reader = new GeneratorBodyReader(
                fromChunks(
                    Buffer.from('hel'),
                    Buffer.from('lo '),
                    Buffer.from('world'),
                ),
            );
            await reader.read();
            await reader.read();
            await reader.read();
            expect(reader.length).toBe(11);
        });

        test('should not increase the length on EOF (null) reads', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('hi')));
            await reader.read();
            await reader.read();
            await reader.read();
            expect(reader.length).toBe(2);
        });

        test('should throw when body length exceeded from max body length threshold', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('x'.repeat(501))));
            await expect(reader.read()).rejects.toThrow('Body length exceeded the maximum number of bytes');
        });
    });

    describe('happy path', () => {
        test('should yield nothing and return null when the generator ends immediately', async () => {
            const reader = new GeneratorBodyReader(empty());

            expect(await reader.read()).toBeNull();
        });

        test('should return the only chunk when the generator yields exactly once', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('hello')));

            expect((await reader.read())?.toString()).toBe('hello');
            expect(await reader.read()).toBeNull();
        });

        test('should concatenate body bytes that the generator yields across multiple reads', async () => {
            const reader = new GeneratorBodyReader(
                fromChunks(
                    Buffer.from('hel'),
                    Buffer.from('lo '),
                    Buffer.from('world'),
                ),
            );

            expect(await readAllAsString(reader)).toBe('hello world');
        });

        test('should yield each chunk separately across multiple read() calls', async () => {
            const reader = new GeneratorBodyReader(
                fromChunks(
                    Buffer.from('hel'),
                    Buffer.from('lo '),
                    Buffer.from('world'),
                ),
            );

            const first  = await reader.read();
            const second = await reader.read();
            const third  = await reader.read();

            expect(first?.toString()).toBe('hel');
            expect(second?.toString()).toBe('lo ');
            expect(third?.toString()).toBe('world');
        });

        test('should drain byte-by-byte across many small yields', async () => {
            const wire = Buffer.from('hello');
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));
            const reader = new GeneratorBodyReader(fromChunks(...oneByteChunks));

            expect(await readAllAsString(reader)).toBe('hello');
        });

        test('should handle a large body that arrives across many chunks', async () => {
            const total = 400;
            const wire = Buffer.alloc(total, 0x41); // 'A' × 400
            const oneByteChunks = Array.from(wire).map((b) => Buffer.from([b]));
            const reader = new GeneratorBodyReader(fromChunks(...oneByteChunks));

            expect(await readAllAsString(reader)).toBe('A'.repeat(total));
        });
    });

    describe('generator semantics', () => {
        test('should call generator.next() exactly once per read() call', async () => {
            const gen = fromChunks(Buffer.from('hello'), Buffer.from(' world'));
            const nextSpy = vi.spyOn(gen, 'next');
            const reader = new GeneratorBodyReader(gen);

            await reader.read();
            await reader.read();
            await reader.read();

            expect(nextSpy).toHaveBeenCalledTimes(3);
        });

        test('should pull from the generator lazily (not all at once)', async () => {
            let pulls = 0;
            async function* lazy(): BufferGenerator {
                while (true) {
                    pulls++;
                    const got = yield Buffer.from(`chunk-${pulls}`);
                    if (got !== undefined) return;
                }
            }
            const reader = new GeneratorBodyReader(lazy());

            const first = await reader.read();
            expect(first?.toString()).toBe('chunk-1');
            expect(pulls).toBe(1);

            const second = await reader.read();
            expect(second?.toString()).toBe('chunk-2');
            expect(pulls).toBe(2);
        });

        test('should return null when the generator returns (without throwing)', async () => {
            async function* endsCleanly(): BufferGenerator {
                yield Buffer.from('only');
            }
            const reader = new GeneratorBodyReader(endsCleanly());

            expect((await reader.read())?.toString()).toBe('only');
            expect(await reader.read()).toBeNull();
        });

        test('should propagate errors thrown by the generator', async () => {
            async function* boom(): BufferGenerator {
                yield Buffer.from('hi');
                throw new Error('upstream failure');
            }
            const reader = new GeneratorBodyReader(boom());

            expect((await reader.read())?.toString()).toBe('hi');
            await expect(reader.read()).rejects.toThrow('upstream failure');
        });
    });

    describe('EOF semantics', () => {
        test('should return null on every subsequent read() after the generator ends', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('x')));

            expect((await reader.read())?.toString()).toBe('x');
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
            expect(await reader.read()).toBeNull();
        });

        test('should not advance length after the generator has ended', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('done')));
            await readAllAsString(reader);
            const lenAfterDrain = reader.length;

            await reader.read();
            await reader.read();
            expect(reader.length).toBe(lenAfterDrain);
        });
    });

    describe('yielded-buffer independence', () => {
        test('should return buffers from the generator as-is (no copy)', async () => {
            // The reader wraps a generator; it does not own a DynamicBuffer to copy from.
            // The same Buffer reference that the generator yields is the one read() returns.
            const buf = Buffer.from('hello');
            const reader = new GeneratorBodyReader(fromChunks(buf));

            expect(await reader.read()).toBe(buf);
        });
    });

    describe('empty body', () => {
        test('should yield no body bytes when the generator yields nothing', async () => {
            const reader = new GeneratorBodyReader(empty());

            expect(await readAllAsString(reader)).toBe('');
        });

        test('should treat a single empty-buffer yield as the body', async () => {
            // The generator yields a 0-byte Buffer; the reader must still advance
            // past it and surface it as a real (empty) chunk before returning null.
            async function* emptyChunk(): BufferGenerator {
                yield Buffer.alloc(0);
            }
            const reader = new GeneratorBodyReader(emptyChunk());

            const first = await reader.read();
            expect(first).not.toBeNull();
            expect(first?.length).toBe(0);

            expect(await reader.read()).toBeNull();
        });
    });

    describe('boundary conditions', () => {
        test('should handle a body of exactly one byte', async () => {
            const reader = new GeneratorBodyReader(fromChunks(Buffer.from('A')));

            expect((await reader.read())?.toString()).toBe('A');
            expect(await reader.read()).toBeNull();
        });

        test('should accumulate length across many tiny chunks without losing bytes', async () => {
            // 250 chunks of 2 bytes each = 500 bytes, exactly at the mocked limit.
            const chunks = Array.from({length: 250}, () => Buffer.from('xy'));
            const reader = new GeneratorBodyReader(fromChunks(...chunks));

            const total = await readAllAsString(reader);
            expect(total.length).toBe(500);
            expect(reader.length).toBe(500);
        });

        test('should throw as soon as the cumulative length crosses the threshold', async () => {
            // First chunk fits (250 bytes), second chunk would push us over (501 total).
            const reader = new GeneratorBodyReader(
                fromChunks(Buffer.from('x'.repeat(250)), Buffer.from('y'.repeat(251))),
            );

            await reader.read();
            await expect(reader.read()).rejects.toThrow('Body length exceeded the maximum number of bytes');
        });
    });
});
