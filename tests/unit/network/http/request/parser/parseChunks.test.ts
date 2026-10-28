import { describe, it, expect } from 'vitest';
import { parseChunks } from '../../../../../../src/network/http/request/parser/parseChunks.js';
import ByteConsumer from '../../../../../../src/buffer/ByteConsumer.js';

// Helper to simulate the underlying byte source
async function* bufferGenerator(chunks: Buffer[]) {
    for (const chunk of chunks) {
        yield chunk;
    }
}

describe('parseChunks', () => {
    it('should `parse simple chunked body`', async () => {
        const input = [
            Buffer.from('5\r\nhello\r\n'),
            Buffer.from('5\r\nworld\r\n'),
            Buffer.from('0\r\n\r\n')
        ];

        const chunks: Buffer[] = [];
        for await (const chunk of parseChunks(new ByteConsumer(bufferGenerator(input)))) {
            chunks.push(chunk);
        }

        expect(Buffer.concat(chunks).toString()).toBe('helloworld');
    });

    it('should `throw HttpError(400) when chunk size is invalid`', async () => {
        const input = [Buffer.from('invalid\r\n')];

        await expect(async () => {
            for await (const _ of parseChunks(new ByteConsumer(bufferGenerator(input)))) {}
        }).rejects.toThrow(); // Should be 400
    });

    it('should `throw HttpError(413) when chunk size exceeds limit`', async () => {
        const input = [Buffer.from('100000000\r\n')]; // Extremely large

        await expect(async () => {
            for await (const _ of parseChunks(new ByteConsumer(bufferGenerator(input)))) {}
        }).rejects.toThrow(); // Should be 413
    });

    it('should `handle fragmented chunk headers`', async () => {
        const input = [
            Buffer.from('5'),
            Buffer.from('\r\nhello\r\n'),
            Buffer.from('0\r\n\r\n')
        ];

        const chunks: Buffer[] = [];
        for await (const chunk of parseChunks(new ByteConsumer(bufferGenerator(input)))) {
            chunks.push(chunk);
        }

        expect(Buffer.concat(chunks).toString()).toBe('hello');
    });

    it('should `handle chunk extensions`', async () => {
        const input = [
            Buffer.from('5;ext=1\r\nhello\r\n'),
            Buffer.from('0\r\n\r\n')
        ];

        const chunks: Buffer[] = [];
        for await (const chunk of parseChunks(new ByteConsumer(bufferGenerator(input)))) {
            chunks.push(chunk);
        }

        expect(Buffer.concat(chunks).toString()).toBe('hello');
    });

    it('should `throw when CRLF is missing after data`', async () => {
        const input = [
            Buffer.from('5\r\nhelloabc'), // Missing \r\n
            Buffer.from('0\r\n\r\n')
        ];

        await expect(async () => {
            for await (const _ of parseChunks(new ByteConsumer(bufferGenerator(input)))) {}
        }).rejects.toThrow();
    });
});