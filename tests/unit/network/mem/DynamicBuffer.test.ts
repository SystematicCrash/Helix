import {beforeEach, afterEach, expect, test, describe} from "vitest";
import DynamicBuffer from "../../../../src/network/mem/DynamicBuffer.js";
import {push} from "node:stream/iter";

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

        test('should throw on push when buffer size exceeded the threshold', () => {
            const buffer = new DynamicBuffer();
            buffer.push(Buffer.alloc(MAX_BUFFER_SIZE - 1, 0x41));
            expect(() => buffer.push(Buffer.from('more data')))
                .toThrow(new Error('Buffer maximum size exceeded!'));
        });
    });

    describe("pop()", () => {

        test("should throw when requested length is more that the current buffer length", () => {
             const buffer = new DynamicBuffer();
             const data = Buffer.from('This is the data');
             buffer.push(data);

             expect(() => buffer.pop(data.length + 1))
                 .toThrow(new Error(`Cannot pop ${buffer.length + 1} bytes, only ${buffer.length} is available!`));
        });

        test("should pop the requests data length from buffer", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.pop(10);
            expect(buffer.length).toEqual(data.length - 10);
        });

        test("should not compact the popped data when it's too small", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.pop(10);
            expect(buffer.start).toEqual(10);
            expect(buffer.end).toEqual(data.length);
        });

        test("should compact buffer when popped data is too large", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from("x".repeat(32));
            buffer.push(data);

            expect(buffer.capacity).toEqual(32);
            buffer.pop(30);
            expect(buffer.start).toEqual(0);
            expect(buffer.end).toEqual(2);
        });
    });

    describe("cutUntil()", () => {

        test("should cut requested data length", () => {
            const buffer = new DynamicBuffer(Buffer.from('This is the data'));

            const data = buffer.cutUntil(4);
            expect(data.toString()).toEqual('This');
        });

        test("should throw when requested data length is more than the available data length", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            expect(() => buffer.cutUntil(data.length + 1))
                .toThrow(new Error(`Cannot cut ${data.length + 1} bytes, only ${data.length} is available!`));
        });

        test("should cut just the unconsumed data", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.pop(10);
            const cut = buffer.cutUntil(buffer.length);
            expect(cut.length).lessThan(data.length);
        });
    });
});