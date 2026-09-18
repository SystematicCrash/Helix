import { describe, test, expect } from 'vitest';
import MemoryBody from '../../../../../src/network/http/body/MemoryBody.js';

describe('MemoryBody', () => {
    describe('length', () => {
        test('should match buffer length', () => {
            const buf = Buffer.from('hello');
            const body = new MemoryBody(buf);
            expect(body.length).toBe(5);
        });
    });

    describe('read()', () => {
        test('should return the buffer once', async () => {
            const buf = Buffer.from('hello');
            const body = new MemoryBody(buf);
            expect(await body.read()).toEqual(buf);
            expect(await body.read()).toBeNull();
        });
    });
});
