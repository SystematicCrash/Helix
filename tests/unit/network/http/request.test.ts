import { describe, test, expect, vi } from 'vitest';
import HttpError from '../../../../src/net/http/common/HttpError.js';
import { mockedTCPConnection } from '../common/utils.js';
import DynamicBuffer from '../../../../src/buffer/DynamicBuffer.js';
import HttpRequest from '../../../../src/net/http/request/HttpRequest.js';
import {MAX_BODY_LENGTH} from '../../../../src/net/http/common/constants.js';
import EOFBodyReader from '../../../../src/net/http/request/body/EOFBodyReader.js';

function fromRaw(head: string): HttpRequest {
    return new HttpRequest(Buffer.from(head));
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
                .toThrow(new HttpError(405, 'Method not allowed'));
        });

        test('should throw 405 when method is lowercase', () => {
            expect(() => fromRaw('get /user/messages HTTP/1.1\r\nHost: example.com'))
                .toThrow(new HttpError(405, 'Method not allowed'));
        });
    });

    describe('invalid version', () => {
        test('should throw 501 when HTTP version is not supported', () => {
            expect(() => fromRaw('POST /user/messages HTTP/3\r\nHost: example.com'))
                .toThrow(new HttpError(501, 'Http version not supported. supported version: 1.1'));
        });

        test('should throw 501 when HTTP version is malformed', () => {
            expect(() => fromRaw('POST /user/messages INVALID\r\nHost: example.com'))
                .toThrow(new HttpError(501, 'Http version not supported. supported version: 1.1'));
        });
    });

    describe('malformed request line', () => {
        test('should throw 400 when there are double spaces between fields', () => {
            expect(() => fromRaw('GET  /api/users HTTP/1.1\r\nHost: example.com'))
                .toThrow(new HttpError(400, 'Malformed request line'));
        });

        test('should throw 400 when there is a trailing space after the version', () => {
            expect(() => fromRaw('GET /api/users HTTP/1.1 \r\nHost: example.com'))
                .toThrow(new HttpError(400, 'Malformed request line'));
        });

        test('should throw 400 when the request line has a leading space', () => {
            expect(() => fromRaw(' GET /api/users HTTP/1.1\r\nHost: example.com'))
                .toThrow(new HttpError(400, 'Malformed request line'));
        });

        test('should throw 400 when the request line has only two fields', () => {
            expect(() => fromRaw('GET /api/users\r\nHost: example.com'))
                .toThrow(new HttpError(400, 'Malformed request line'));
        });

        test('should throw 400 when the request line uses tabs as separators', () => {
            expect(() => fromRaw('GET\t/api/users\tHTTP/1.1\r\nHost: example.com'))
                .toThrow(new HttpError(400, 'Malformed request line'));
        });
    });
});

describe('createBodyReader()', () => {

    describe('content-length body', () => {
        test('should return fixed reader with correct length', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 1000');

            const reader = request.getBodyReader(mockedTCPConnection(), new DynamicBuffer());
            expect(reader).toMatchObject({ length: 1000 });
        });

        test('should return fixed reader with zero length when content-length is 0', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 0');

            const reader = request.getBodyReader(mockedTCPConnection(), new DynamicBuffer());
            expect(reader).toMatchObject({length: 0});
        });
    });

    describe('content-length validation', () => {
        test('should throw 400 when content-length is not a number', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: abc');
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(400, 'Invalid Content-Length'));
        });

        test('should throw 400 when content-length is negative', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: -1');
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(400, 'Invalid Content-Length'));
        });

        test('should throw 400 when content-length is a float', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 12.5');
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(400, 'Invalid Content-Length'));
        });

        test('should throw 400 when content-length has a leading plus sign', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: +100');
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(400, 'Invalid Content-Length'));
        });

        test('should throw 400 when content-length is hex', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: 0x10');
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(400, 'Invalid Content-Length'));
        });

        test('should throw 413 when content-length exceeds MAX_BODY_LENGTH', () => {
            const request = fromRaw(`POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: ${MAX_BODY_LENGTH + 1}`);
            expect(() => request.getBodyReader(mockedTCPConnection(), new DynamicBuffer()))
                .toThrow(new HttpError(413, 'Content Too Large'));
        });

        test('should accept content-length exactly at MAX_BODY_LENGTH', () => {
            const request = fromRaw(`POST /user/messages HTTP/1.1\r\nHost: example.com\r\nContent-Length: ${MAX_BODY_LENGTH}`);
            const reader = request.getBodyReader(mockedTCPConnection(), new DynamicBuffer());
            expect(reader).toMatchObject({length: MAX_BODY_LENGTH});
        });
    });

    describe('chunked body', () => {
        test('should read chunked body correctly', async () => {
            const conn = {
                read: vi.fn()
                    .mockResolvedValueOnce(Buffer.from('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n'))
            } as any;

            const buf = new DynamicBuffer();
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = request.getBodyReader(conn, buf);
            const chunks: Buffer[] = [];
            let chunk;
            while ((chunk = await reader.read()) !== null) {
                chunks.push(Buffer.from(chunk));
            }

            expect(Buffer.concat(chunks).toString()).toBe('Wikipedia');
        });

        test('should throw on unexpected EOF while reading chunk size', async () => {
            const conn = {
                read: vi.fn().mockResolvedValue(null)
            } as any;

            const buf = new DynamicBuffer();
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = request.getBodyReader(conn, buf);
            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading chunk data');
        });

        test('should throw on invalid chunk size hex', async () => {
            const conn = {
                read: vi.fn().mockResolvedValue(Buffer.from('XYZ\r\n'))
            } as any;

            const buf = new DynamicBuffer();
            const request = fromRaw('POST / HTTP/1.1\r\nHost: example.com\r\nTransfer-Encoding: chunked');

            const reader = request.getBodyReader(conn, buf);
            await expect(reader.read()).rejects.toThrow('Invalid chunk size');
        });
    });

    describe('no body', () => {
        test('should return EOF reader when no content-length or transfer-encoding is set', () => {
            const request = fromRaw('POST /user/messages HTTP/1.1\r\nHost: example.com');

            const reader = request.getBodyReader(mockedTCPConnection(), new DynamicBuffer());
            expect(reader).toBeInstanceOf(EOFBodyReader);
        });
    });
});
