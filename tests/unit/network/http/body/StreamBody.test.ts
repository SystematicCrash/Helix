import { describe, test, expect } from 'vitest';
import StreamBody from '../../../../../src/network/http/body/StreamBody.js';

describe('StreamBody', () => {
    test('should stream data from generator', async () => {
        const generator = (async function* () {
            yield Buffer.from('hello');
            yield Buffer.from('world');
        })();

        const body = new StreamBody(generator);
        expect(await body.read()).toEqual(Buffer.from('hello'));
        expect(await body.read()).toEqual(Buffer.from('world'));
        expect(await body.read()).toBeNull();
    });

    test('should throw if stream exceeds max size', async () => {
        const generator = (async function* () {
            yield Buffer.alloc(1024 * 1024 + 1);
        })();

        const body = new StreamBody(generator);
        await expect(body.read()).rejects.toThrow('Body length exceeded the maximum number of bytes');
    });
});
