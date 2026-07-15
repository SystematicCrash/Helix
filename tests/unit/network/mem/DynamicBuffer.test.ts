import {beforeEach, afterEach, expect, test, describe} from "vitest";
import DynamicBuffer from "../../../../src/network/mem/DynamicBuffer.js";

describe("DynamicBuffer", () => {
    describe("push()", () => {

        test("should correctly push initial data to the buffer", () => {
            const initialData = Buffer.from('Hello world!');
            const buffer = new DynamicBuffer(initialData);

           expect(buffer.length).toEqual(initialData.length);
           expect(buffer.capacity).toEqual(initialData.length);
           expect(buffer.start).toEqual(0);
           expect(buffer.end).toEqual(initialData.length);
        });

        test("should correctly push new data to the buffer", () => {
            const buffer = new DynamicBuffer();
            const newData = Buffer.from('Hello world!');

            buffer.push(newData);
            expect(buffer.length).toEqual(newData.length);
            expect(buffer.capacity).toEqual(32);
            expect(buffer.start).toEqual(0);
            expect(buffer.end).toEqual(newData.length);
        });

        test("should grow buffer capacity exponentially on new data", () => {
            const buffer = new DynamicBuffer();

            const first = Buffer.from('first data chunk');
            buffer.push(first);
            expect(buffer.capacity).toEqual(32);

            const second = Buffer.from('x'.repeat(buffer.capacity + 2));
            buffer.push(second);
            expect(buffer.capacity).toEqual(64);

            const third = Buffer.from('x'.repeat(buffer.capacity + 2));
            buffer.push(third);
            expect(buffer.capacity).toEqual(128);
        });

        test("should not grow buffer capacity when it's enough", () => {
            const buffer = new DynamicBuffer();
            const first = Buffer.from('first data chunk');

            buffer.push(first);
            expect(buffer.capacity).toEqual(32);

            const second = Buffer.from('x'.repeat(buffer.capacity - buffer.length));
            buffer.push(second);
            expect(buffer.capacity).toEqual(32);
        });

        test('should grow the length when new data is appended', () => {
            const buffer = new DynamicBuffer();

            const first = Buffer.from('first data chunk');
            buffer.push(first);
            expect(buffer.length).toEqual(first.length);

            const second = Buffer.from('second data chunk');
            buffer.push(second);
            expect(buffer.length).toEqual(first.length + second.length);
        });
    });
});