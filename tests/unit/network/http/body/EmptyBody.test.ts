import { describe, test, expect } from 'vitest';
import EmptyBody from '../../../../../src/network/http/body/EmptyBody.js';

describe('EmptyBody', () => {
    describe('length', () => {
        test('should have length 0', () => {
            const body = new EmptyBody();
            expect(body.length).toBe(0);
        });
    });

    describe('read()', () => {
        test('should return null on first read', async () => {
            const body = new EmptyBody();
            expect(await body.read()).toBeNull();
        });
    });
});
