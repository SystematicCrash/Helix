import { DEFAULT_READ_LENGTH } from '../../../src/fs/common/constants.js';
import { describe, test, expect } from 'vitest';
import { resolveIOOptions } from '../../../src/fs/file/IOOptions.js';
import FsError from '../../../src/fs/common/FsError.js';
import { FsErrCode } from '../../../src/fs/common/constants.js';

describe('resolveIOOptions()', () => {
    describe('normalization', () => {
        test('should fill every default for empty input', () => {
            const io = resolveIOOptions(undefined);
            expect(io.offset).toBe(0);
            expect(io.position).toBeNull();
            expect(io.length).toBe(DEFAULT_READ_LENGTH);
            expect(io.buffer).toBeInstanceOf(Buffer);
            expect(io.buffer.length).toBe(DEFAULT_READ_LENGTH);
        });

        test('should treat a bare number as length', () => {
            const io = resolveIOOptions(64);
            expect(io.length).toBe(64);
            expect(io.buffer.length).toBe(64);
        });

        test('should keep an explicit buffer', () => {
            const buf = Buffer.alloc(10);
            const io = resolveIOOptions({buffer: buf});
            expect(io.buffer).toBe(buf);
        });

        test('should default length to the remaining buffer space', () => {
            const io = resolveIOOptions({buffer: Buffer.alloc(10), offset: 3});
            expect(io.length).toBe(7);
        });

        test('should preserve an explicit position of null', () => {
            const io = resolveIOOptions({position: null});
            expect(io.position).toBeNull();
        });

        test('should preserve an explicit position', () => {
            const io = resolveIOOptions({position: 42});
            expect(io.position).toBe(42);
        });
    });

    describe('validation', () => {
        test('should reject a negative offset', () => {
            expect(() => resolveIOOptions({offset: -1})).toThrow(FsError);
        });

        test('should reject a non-integer offset', () => {
            expect(() => resolveIOOptions({offset: 0.5})).toThrow(FsError);
        });

        test('should reject a zero length', () => {
            expect(() => resolveIOOptions({length: 0})).toThrow(FsError);
        });

        test('should reject a negative length', () => {
            expect(() => resolveIOOptions({length: -3})).toThrow(FsError);
        });

        test('should reject a non-integer length', () => {
            expect(() => resolveIOOptions({length: 1.5})).toThrow(FsError);
        });

        test('should reject a negative position', () => {
            expect(() => resolveIOOptions({position: -2})).toThrow(FsError);
        });

        test('should reject a non-integer position', () => {
            expect(() => resolveIOOptions({position: 2.5})).toThrow(FsError);
        });

        test('should reject a non-Buffer buffer', () => {
            expect(() => resolveIOOptions({buffer: 'nope' as unknown as Buffer})).toThrow(FsError);
        });

        test('should reject a length exceeding the buffer space', () => {
            expect(() => resolveIOOptions({buffer: Buffer.alloc(4), length: 5})).toThrow(FsError);
        });

        test('should reject a length exceeding the buffer space after offset', () => {
            expect(() => resolveIOOptions({buffer: Buffer.alloc(10), offset: 8, length: 3})).toThrow(FsError);
        });

        test('validation errors carry INVALID_ARGUMENT code', () => {
            try {
                resolveIOOptions({offset: -1});
                expect.unreachable();
            } catch (err) {
                expect(FsError.is(err as Error, FsErrCode.INVALID_ARGUMENT)).toBe(true);
            }
        });
    });
});
