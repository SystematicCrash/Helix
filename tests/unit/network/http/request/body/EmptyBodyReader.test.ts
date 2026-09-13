import { describe, test, expect } from 'vitest';
import EmptyBodyReader from '../../../../../../src/network/http/request/body/EmptyBodyReader.js';

describe('EmptyBodyReader', () => {

    describe('length', () => {
        test('should expose length = 0 at construction', () => {
            const reader = new EmptyBodyReader();
            expect(reader.length).toBe(0);
        });

        test('should keep length at 0 after read', async () => {
            const reader = new EmptyBodyReader();
            await reader.read();
            expect(reader.length).toBe(0);
        });
    });

    describe('happy path', () => {
        test('should return null on the first read', async () => {
            const reader = new EmptyBodyReader();
            expect(await reader.read()).toBeNull();
        });

        test('should return null on every subsequent read', async () => {
            const reader = new EmptyBodyReader();
            for (let i = 0; i < 5; i++) {
                expect(await reader.read()).toBeNull();
            }
        });
    });

    describe('EOF semantics', () => {
        test('should never throw on read()', async () => {
            const reader = new EmptyBodyReader();
            for (let i = 0; i < 10; i++) {
                await expect(reader.read()).resolves.toBeNull();
            }
        });
    });
});
