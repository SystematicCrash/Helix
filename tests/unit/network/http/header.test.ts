import { describe, expect, test } from 'vitest';
import DynamicBuffer from '../../../../src/network/mem/DynamicBuffer.js';

describe('DynamicBuffer', () => {

    describe('constructor', () => {
        test('should initialize with provided data', () => {
            const data = Buffer.from('Hello world!');
            const buf = new DynamicBuffer(data);

            expect(buf.length).toBe(data.length);
            expect(buf.capacity).toBe(data.length);
            expect(buf.start).toBe(0);
            expect(buf.end).toBe(data.length);
        });

        test('should initialize empty with zero length and capacity', () => {
            const buf = new DynamicBuffer();

            expect(buf.length).toBe(0);
            expect(buf.capacity).toBe(0);
            expect(buf.start).toBe(0);
            expect(buf.end).toBe(0);
        });
    });

    describe('push()', () => {
        test('should append data and update length', () => {
            const buf = new DynamicBuffer();
            const data = Buffer.from('Hello world!');

            buf.push(data);

            expect(buf.length).toBe(data.length);
            expect(buf.start).toBe(0);
            expect(buf.end).toBe(data.length);
        });

        test('should allocate minimum capacity of 32 on first push', () => {
            const buf = new DynamicBuffer();

            buf.push(Buffer.from('Hello world!'));

            expect(buf.capacity).toBe(32);
        });

        test('should accumulate length across multiple pushes', () => {
            const buf = new DynamicBuffer();
            const first  = Buffer.from('first data chunk');
            const second = Buffer.from('second data chunk');

            buf.push(first);
            buf.push(second);

            expect(buf.length).toBe(first.length + second.length);
        });

        test('should not grow capacity when existing capacity is sufficient', () => {
            const buf = new DynamicBuffer();

            buf.push(Buffer.from('first data chunk'));
            expect(buf.capacity).toBe(32);

            buf.push(Buffer.from('x'.repeat(buf.capacity - buf.length)));
            expect(buf.capacity).toBe(32);
        });

        test('should double capacity when data exceeds current capacity', () => {
            const buf = new DynamicBuffer();

            buf.push(Buffer.from('first data chunk'));
            expect(buf.capacity).toBe(32);

            buf.push(Buffer.from('x'.repeat(buf.capacity + 2)));
            expect(buf.capacity).toBe(64);
        });

        test('should double capacity repeatedly until data fits', () => {
            const buf = new DynamicBuffer();

            buf.push(Buffer.from('x'.repeat(32)));
            expect(buf.capacity).toBe(32);

            buf.push(Buffer.from('x'.repeat(34)));
            expect(buf.capacity).toBe(128);
        });
    });

    describe('pop()', () => {
        test('should reduce length by the popped amount', () => {
            const buf = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buf.push(data);

            buf.pop(10);

            expect(buf.length).toBe(data.length - 10);
        });

        test('should advance start pointer for small pops', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('This is the data'));

            buf.pop(10);

            expect(buf.start).toBe(10);
        });

        test('should compact buffer when popped amount exceeds half capacity', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('x'.repeat(32)));
            expect(buf.capacity).toBe(32);

            buf.pop(30);

            expect(buf.start).toBe(0);
            expect(buf.end).toBe(2);
        });

        test('should throw when requested length exceeds available data', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('This is the data'));

            expect(() => buf.pop(buf.length + 1))
                .toThrow(`Cannot pop ${buf.length + 1} bytes, only ${buf.length} is available!`);
        });

        test('should throw when popping from empty buffer', () => {
            const buf = new DynamicBuffer();

            expect(() => buf.pop(1))
                .toThrow();
        });

        test('should allow popping all remaining data', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('hello'));

            buf.pop(5);

            expect(buf.length).toBe(0);
        });
    });

    describe('cutUntil()', () => {
        test('should return requested number of bytes from start', () => {
            const buf = new DynamicBuffer(Buffer.from('This is the data'));

            const data = buf.cutUntil(4);

            expect(data.toString()).toBe('This');
        });

        test('should return only unconsumed data after pop()', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('This is the data'));

            buf.pop(8);
            const cut = buf.cutUntil(buf.length);

            expect(cut.length).toBeLessThan(16);
            expect(cut.toString()).toBe('the data');
        });

        test('should not modify buffer length after cut', () => {
            const buf = new DynamicBuffer(Buffer.from('Hello world'));
            const lengthBefore = buf.length;

            buf.cutUntil(5);

            expect(buf.length).toBe(lengthBefore);
        });

        test('should throw when requested length exceeds available data', () => {
            const buf = new DynamicBuffer();
            buf.push(Buffer.from('This is the data'));

            expect(() => buf.cutUntil(buf.length + 1))
                .toThrow(`Cannot cut ${buf.length + 1} bytes, only ${buf.length} is available!`);
        });

        test('should throw when cutting from empty buffer', () => {
            const buf = new DynamicBuffer();

            expect(() => buf.cutUntil(1))
                .toThrow();
        });
    });
});