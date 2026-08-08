import {beforeEach, afterEach, expect, test, describe} from "vitest";
import DynamicBuffer from "../../../../src/network/mem/DynamicBuffer.js";
import {push} from "node:stream/iter";
import {MAX_BUFFER_SIZE, BufferErrCode} from "../../../../src/network/mem/constants.js";
import BufferError from "../../../../src/network/mem/BufferError.js";
import Delimiter from "../../../../src/network/common/constants.js";

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

            const second = Buffer.alloc(buffer.capacity, 0x41);
            buffer.push(second);
            expect(buffer.capacity).toEqual(64);

            const third = Buffer.alloc(buffer.capacity, 0x41);
            buffer.push(third);
            expect(buffer.capacity).toEqual(128);
        });

        test("should not grow buffer capacity when it's enough", () => {
            const buffer = new DynamicBuffer();
            const first = Buffer.from('first data chunk');

            buffer.push(first);
            expect(buffer.capacity).toEqual(32);

            const second = Buffer.alloc(buffer.capacity - buffer.length, 0x41);
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
                .toThrow(new BufferError(BufferErrCode.MAX_SIZE_EXCEEDED));
            
            try {
                buffer.push(Buffer.from('more data'));
            } catch (err) {
                expect(BufferError.is(err as Error, BufferErrCode.MAX_SIZE_EXCEEDED)).toBe(true);
            }
        });
    });

    describe("clear()", () => {

        test("should throw when requested length is more that the current buffer length", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            expect(() => buffer.clear(data.length + 1))
                .toThrow(new BufferError(BufferErrCode.CLEAR_EXCEEDED, `Cannot clear ${buffer.length + 1} bytes, only ${buffer.length} is available!`));

            try {
                buffer.clear(data.length + 1);
            } catch (err) {
                expect(BufferError.is(err as Error, BufferErrCode.CLEAR_EXCEEDED)).toBe(true);
            }
        });

        test("should pop the requests data length from buffer", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.clear(10);
            expect(buffer.length).toEqual(data.length - 10);
        });

        test("should not compact the popped data when it's too small", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.clear(10);
            expect(buffer.start).toEqual(10);
            expect(buffer.end).toEqual(data.length);
        });

        test("should compact buffer when popped data is too large", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.alloc(32, 0x41);
            buffer.push(data);

            expect(buffer.capacity).toEqual(32);
            buffer.clear(30);
            expect(buffer.start).toEqual(0);
            expect(buffer.end).toEqual(2);
        });

        test('should compact whole buffer when no length is given', async () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.alloc(32, 0x41);
            buffer.push(data);

            buffer.clear();
            expect(buffer.start).toEqual(0);
            expect(buffer.end).toEqual(0);
        });
    });

    describe("copy()", () => {

        test("should cut requested data length", () => {
            const buffer = new DynamicBuffer(Buffer.from('This is the data'));

            const data = buffer.getView(4);
            expect(data.toString()).toEqual('This');
        });

        test("should throw when requested data length is more than the available data length", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            expect(() => buffer.getView(data.length + 1))
                .toThrow(new BufferError(BufferErrCode.VIEW_EXCEEDED, `Cannot cut ${data.length + 1} bytes, only ${data.length} is available!`));

            try {
                buffer.getView(data.length + 1);
            } catch (err) {
                expect(BufferError.is(err as Error, BufferErrCode.VIEW_EXCEEDED)).toBe(true);
            }
        });

        test("should cut just the unconsumed data", () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            buffer.clear(10);
            const cut = buffer.getView(buffer.length);
            expect(cut.length).lessThan(data.length);
        });

        test('should copy whole data when no length is given', async () => {
            const buffer = new DynamicBuffer();
            const data = Buffer.from('This is the data');
            buffer.push(data);

            const copied = buffer.getView();
            expect(copied).toEqual(data);
        })
    });

    describe("consume()", () => {
        test("should consume message until default newline delimiter", () => {
            const buffer = new DynamicBuffer();
            buffer.push(Buffer.from("hello\nworld\n"));

            const msg1 = buffer.consume(Delimiter.LF);
            expect(msg1?.toString()).toEqual("hello\n");
            expect(buffer.length).toEqual(6);

            const msg2 = buffer.consume(Delimiter.LF);
            expect(msg2?.toString()).toEqual("world\n");
            expect(buffer.length).toEqual(0);
        });

        test("should return null when delimiter is not found", () => {
            const buffer = new DynamicBuffer();
            buffer.push(Buffer.from("hello"));

            expect(buffer.consume(Delimiter.LF)).toBeNull();
        });

        test("should consume message until custom string delimiter", () => {
            const buffer = new DynamicBuffer();
            buffer.push(Buffer.from("foo|bar|baz"));

            const msg1 = buffer.consume('|');
            expect(msg1?.toString()).toEqual("foo|");
            expect(buffer.length).toEqual(7);
        });

        test("should consume message until custom numeric char code delimiter", () => {
            const buffer = new DynamicBuffer();
            buffer.push(Buffer.from("foo|bar|baz"));

            const msg1 = buffer.consume('|'.charCodeAt(0));
            expect(msg1?.toString()).toEqual("foo|");
            expect(buffer.length).toEqual(7);
        });
    });
});
