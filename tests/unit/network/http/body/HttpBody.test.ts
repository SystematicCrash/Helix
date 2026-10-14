import { describe, test, expect } from 'vitest';
import { HttpBody } from '../../../../../src/network/http/body/HttpBody.js';
import HttpError from '../../../../../src/network/http/common/HttpError.js';

/** Concrete HttpBody fixture: yields each scripted chunk once, then null on subsequent pulls. */
class ScriptedBody extends HttpBody {
    constructor(private readonly chunks: (Buffer | null)[]) {
        super();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        return this.chunks.shift() ?? null;
    }
}

describe('HttpBody', () => {
    describe('drain()', () => {
        test('should consume every chunk until EOF and update readBytes', async () => {
            const chunks = [Buffer.from('hello'), Buffer.from(' '), Buffer.from('world')];
            const body = new ScriptedBody(chunks);

            await body.drain();

            expect(body.readBytes).toBe(11);
            expect(chunks).toHaveLength(0);
        });

        test('should resolve without reading when the body is already at EOF', async () => {
            const chunks: (Buffer | null)[] = [];
            const body = new ScriptedBody(chunks);

            await expect(body.drain()).resolves.toBeUndefined();
            expect(body.readBytes).toBe(0);
        });

        test('should throw contentTooLarge when cumulative size exceeds MAX_BODY_LENGTH', async () => {
            const oversized = Buffer.alloc(1024 * 1024 + 1);
            const body = new ScriptedBody([oversized]);

            await expect(body.drain()).rejects.toBeInstanceOf(HttpError);
        });
    });
});