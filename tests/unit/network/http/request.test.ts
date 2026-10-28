import { describe, test, expect } from 'vitest';
import HttpError from '../../../../src/network/http/common/HttpError.js';
import HttpRequest from '../../../../src/network/http/request/HttpRequest.js';
import {MAX_BODY_LENGTH} from '../../../../src/network/http/body/constants.js';
import ByteConsumer from '../../../../src/buffer/ByteConsumer.js';
import EmptyBody from '../../../../src/network/http/body/EmptyBody.js';

function fromRaw(head: string): HttpRequest {
    return new HttpRequest(Buffer.from(head));
}

/** An empty byte source; used when the tests only inspect the resolved body type/length. */
function emptyConsumer(): ByteConsumer {
    return new ByteConsumer((async function* () {})());
}

describe('new HttpRequest()', () => {

    describe('valid requests', () => {
        test('should parse raw bytes into an HttpRequest object', () => {
            const parsed = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nCustom: something');

            expect(parsed).toMatchObject({
                method: 'POST',
                url: '/user/messages',
                version: 'HTTP/1.1',
                headers: new Map([
                    ['host', 'example.com'],
                    ['custom', 'something'],
                ]),
            });
        });

        test('should parse GET request', () => {
            const parsed = fromRaw('GET /api/users HTTP/1.1\r\nHost: example.com');

            expect(parsed).toMatchObject({
                method: 'GET',
                url: '/api/users',
                version: 'HTTP/1.1',
            });
        });
    });

    describe('invalid method', () => {
        test('should throw 405 when method is not allowed', () => {
            expect(() => fromRaw('INVALID /user/messages HTTP/1.1\r\nHost: example.com'))
                .toThrow(HttpError.methodNotAllowed());
        });

        test('should throw 405 when method is lowercase', () => {
            expect(() => fromRaw('get /user/messages HTTP/1.1\r\nHost: example.com'))
                .toThrow(HttpError.methodNotAllowed());
        });
    });

    describe('invalid version', () => {
        test('should throw 505 when HTTP version is not supported', () => {
            expect(() => fromRaw('POST /user/messages HTTP/3\r\nHost: example.com'))
                .toThrow(new HttpError(505, 'HTTP Version Not Supported', true));
        });

        test('should throw 505 when HTTP version is malformed', () => {
            expect(() => fromRaw('POST /user/messages INVALID\r\nHost: example.com'))
                .toThrow(new HttpError(505, 'HTTP Version Not Supported', true));
        });
    });

    describe('malformed request line', () => {
        test('should throw 400 when there are double spaces between fields', () => {
            expect(() => fromRaw('GET  /api/users HTTP/1.1\r\nHost: example.com'))
                .toThrow(HttpError.invalidRequestLine());
        });

        test('should throw 400 when there is a trailing space after the version', () => {
            expect(() => fromRaw('GET /api/users HTTP/1.1 \r\nHost: example.com'))
                .toThrow(HttpError.invalidRequestLine());
        });

        test('should throw 400 when the request line has a leading space', () => {
            expect(() => fromRaw(' GET /api/users HTTP/1.1\r\nHost: example.com'))
                .toThrow(HttpError.invalidRequestLine());
        });

        test('should throw 400 when the request line has only two fields', () => {
            expect(() => fromRaw('GET /api/users\r\nHost: example.com'))
                .toThrow(HttpError.invalidRequestLine());
        });

        test('should throw 400 when the request line uses tabs as separators', () => {
            expect(() => fromRaw('GET\t/api/users\tHTTP/1.1\r\nHost: example.com'))
                .toThrow(HttpError.invalidRequestLine());
        });
    });
});

describe('createBodyReader()', () => {

    describe('content-length body', () => {
        test('should return fixed reader with correct length', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 1000');

            const reader = await request.getBody(emptyConsumer());
            expect(reader).toMatchObject({ length: 1000 });
        });

        test('should return fixed reader with zero length when content-length is 0', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 0');

            const reader = await request.getBody(emptyConsumer());
            expect(reader).toMatchObject({length: 0});
        });
    });

    describe('content-length validation', () => {
        test('should throw 400 when content-length is not a number', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: abc');
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.invalidHeaders());
        });

        test('should throw 400 when content-length is negative', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: -1');
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.invalidHeaders());
        });

        test('should throw 400 when content-length is a float', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 12.5');
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.invalidHeaders());
        });

        test('should throw 400 when content-length has a leading plus sign', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: +100');
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.invalidHeaders());
        });

        test('should throw 400 when content-length is hex', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 0x10');
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.invalidHeaders());
        });

        test('should throw 413 when content-length exceeds MAX_BODY_LENGTH', async () => {
            const request = fromRaw(`POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: ${MAX_BODY_LENGTH + 1}`);
            await expect(request.getBody(emptyConsumer()))
                .rejects.toThrow(HttpError.contentTooLarge());
        });

        test('should accept content-length exactly at MAX_BODY_LENGTH', async () => {
            const request = fromRaw(`POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: ${MAX_BODY_LENGTH}`);
            const reader = await request.getBody(emptyConsumer());
            expect(reader).toMatchObject({length: MAX_BODY_LENGTH});
        });
    });

    describe('chunked body', () => {
        test('should read chunked body correctly', async () => {
            const consumer = new ByteConsumer((async function* () {
                yield Buffer.from('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n');
            })());
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = await request.getBody(consumer);
            const chunks: Buffer[] = [];
            let chunk;
            while ((chunk = await reader.read()) !== null) {
                chunks.push(Buffer.from(chunk));
            }

            expect(Buffer.concat(chunks).toString()).toBe('Wikipedia');
        });

        test('should throw on unexpected EOF while reading chunk size', async () => {
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = await request.getBody(emptyConsumer());
            await expect(reader.read()).rejects.toThrow();
        });

        test('should throw on invalid chunk size hex', async () => {
            const consumer = new ByteConsumer((async function* () {
                yield Buffer.from('XYZ\r\n');
            })());
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = await request.getBody(consumer);
            await expect(reader.read()).rejects.toThrow();
        });
    });

    describe('no body', () => {
        test('should return empty body when no content-length or transfer-encoding is set', async () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com');

            const body = await request.getBody(emptyConsumer());
            expect(body).toBeInstanceOf(EmptyBody);
        });

        test('should return empty body for GET request without framing', async () => {
            const request = fromRaw('GET /api/users HTTP/1.1\r\nHost: example.com');

            const body = await request.getBody(emptyConsumer());
            expect(body).toBeInstanceOf(EmptyBody);
            expect(body.length).toBe(0);
        });
    });
});
