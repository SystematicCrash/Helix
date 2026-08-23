import { describe, test, expect, vi } from 'vitest';
import { getReader } from '../../../../src/network/http/request/body/bodyReaderFactory.js';
import HttpError from '../../../../src/network/http/common/HttpError.js';
import { mockedTCPConnection } from '../common/utils.js';
import DynamicBuffer from '../../../../src/network/mem/DynamicBuffer.js';
import HttpRequest from '../../../../src/network/http/request/HttpRequest.js';
import type { HttpRequest as HttpRequestData } from '../../../../src/network/http/common/types.js';

describe('new HttpRequest()', () => {

    describe('valid requests', () => {
        test('should parse raw bytes into an HttpRequest object', () => {
            const raw = Buffer.from('POST /user/messages HTTP/1.1\r\nHost: example.com\r\nCustom: something');
            const parsed = new HttpRequest(raw);

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
            const raw = Buffer.from('GET /api/users HTTP/1.1\r\nHost: example.com');
            const parsed = new HttpRequest(raw);

            expect(parsed).toMatchObject({
                method: 'GET',
                url: '/api/users',
                version: 'HTTP/1.1',
            });
        });
    });

    describe('invalid method', () => {
        test('should throw 405 when method is not allowed', () => {
            const raw = Buffer.from('INVALID /user/messages HTTP/1.1\r\nHost: example.com');

            expect(() => new HttpRequest(raw))
                .toThrow(new HttpError(405, 'Method not allowed'));
        });

        test('should throw 405 when method is lowercase', () => {
            const raw = Buffer.from('get /user/messages HTTP/1.1\r\nHost: example.com');

            expect(() => new HttpRequest(raw))
                .toThrow(new HttpError(405, 'Method not allowed'));
        });
    });

    describe('invalid version', () => {
        test('should throw 501 when HTTP version is not supported', () => {
            const raw = Buffer.from('POST /user/messages HTTP/3\r\nHost: example.com');

            expect(() => new HttpRequest(raw))
                .toThrow(new HttpError(501, 'Http version not supported. supported version: 1.1'));
        });

        test('should throw 501 when HTTP version is malformed', () => {
            const raw = Buffer.from('POST /user/messages INVALID\r\nHost: example.com');

            expect(() => new HttpRequest(raw))
                .toThrow(new HttpError(501, 'Http version not supported. supported version: 1.1'));
        });
    });
});

describe('getReader()', () => {

    describe('content-length body', () => {
        test('should return fixed reader with correct length', () => {
            const request: HttpRequestData = {
                method: 'POST',
                url: '/user/messages',
                version: 'HTTP/1.1',
                headers: new Map([['content-length', '1000']]),
            };

            const reader = getReader(mockedTCPConnection(), new DynamicBuffer(), request);
            expect(reader).toMatchObject({ length: 1000 });
        });

        test.todo('should return fixed reader with zero length when content-length is 0', () => {
            const request: HttpRequestData = {
                method: 'POST',
                url: '/user/messages',
                version: 'HTTP/1.1',
                headers: new Map([['content-length', '0']]),
            };

            const reader = getReader(mockedTCPConnection(), new DynamicBuffer(), request);
            expect(reader).toMatchObject({ length: 0 });
        });
    });

    describe('chunked body', () => {
        test('should read chunked body correctly', async () => {
            const conn = {
                read: vi.fn()
                    .mockResolvedValueOnce(Buffer.from('4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n'))
            } as any;

            const buf = new DynamicBuffer();
            const request: HttpRequestData = {
                method: 'POST',
                url: '/',
                version: 'HTTP/1.1',
                headers: new Map([['transfer-encoding', 'chunked']]),
            };

            const reader = getReader(conn, buf, request);
            const chunks: Buffer[] = [];
            let chunk;
            while ((chunk = await reader.read()) !== null) {
                chunks.push(chunk);
            }

            expect(Buffer.concat(chunks).toString()).toBe('Wikipedia');
        });

        test('should throw on unexpected EOF while reading chunk size', async () => {
            const conn = {
                read: vi.fn().mockResolvedValue(null)
            } as any;

            const buf = new DynamicBuffer();
            const request: HttpRequestData = {
                method: 'POST',
                url: '/',
                version: 'HTTP/1.1',
                headers: new Map([['transfer-encoding', 'chunked']]),
            };

            const reader = getReader(conn, buf, request);
            await expect(reader.read()).rejects.toThrow('Unexpected EOF while reading chunk size');
        });

        test('should throw on invalid chunk size hex', async () => {
            const conn = {
                read: vi.fn().mockResolvedValue(Buffer.from('XYZ\r\n'))
            } as any;

            const buf = new DynamicBuffer();
            const request: HttpRequestData = {
                method: 'POST',
                url: '/',
                version: 'HTTP/1.1',
                headers: new Map([['transfer-encoding', 'chunked']]),
            };

            const reader = getReader(conn, buf, request);
            await expect(reader.read()).rejects.toThrow('Invalid chunk size');
        });
    });

    describe('no body', () => {
        test.todo('should return EOF reader when no content-length or transfer-encoding is set');
    });
});