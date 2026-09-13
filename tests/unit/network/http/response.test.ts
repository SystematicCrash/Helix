import { describe, test, expect, beforeEach } from 'vitest';
import HttpError from '../../../../src/network/http/common/HttpError.js';
import { mapErrorToResponse } from '../../../../src/network/http/response/mapErrorToResponse.js';
import { ResponseWriter } from '../../../../src/network/http/response/ResponseWriter.js';
import { HttpVersion } from '../../../../src/network/http/common/constants.js';
import { HttpRequest, HttpResponse } from '../../../../src/network/http/common/types.js';
import MemoryBodyReader from '../../../../src/network/http/request/body/MemoryBodyReader.js';
import { mockedTCPConnection } from '../common/utils.js';
import {TCPConnection} from '../../../../src/network/tcp';
import {ServerInfo} from '../../../../src/server/ServerInfo.js';

const PLACEHOLDER_REQUEST: HttpRequest = {
    method: 'GET',
    url: '/missing',
    version: HttpVersion.HTTP_1_1,
    headers: new Map(),
};

const INFO: ServerInfo = {port: 1234, iface: '0.0.0.0', version: '1.0.0'};

describe('mapErrorToResponse()', () => {

    describe('HttpError mapping', () => {
        test('should map HttpError code and message to response', () => {
            const err = new HttpError(422, 'Cannot parse request body content!');
            const res = mapErrorToResponse(err, PLACEHOLDER_REQUEST, INFO);

            expect(res).toMatchObject({
                code: 422,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: err.message.length },
            });
        });

        test('should render notFound template on 404', async () => {
            const err = new HttpError(404, 'Not found');
            const res = mapErrorToResponse(err, PLACEHOLDER_REQUEST, INFO);

            expect(res.code).toBe(404);
            expect(res.body.length).toBeGreaterThan(0);
            const data = await res.body.read();
            const html = data?.toString('utf-8') ?? '';
            expect(html).toContain('404 Not Found');
            expect(html).toContain(PLACEHOLDER_REQUEST.url);
            expect(html).toContain(PLACEHOLDER_REQUEST.method);
            expect(html).toContain(INFO.version);
        });

        test('should use HttpError status code directly', () => {
            const err = new HttpError(404, 'Not found');
            const res = mapErrorToResponse(err, PLACEHOLDER_REQUEST, INFO);

            expect(res.code).toBe(404);
        });
    });

    describe('generic Error mapping', () => {
        test('should map Error to 500 response with sanitized body', () => {
            const err = new Error('Internal stack-trace leak');
            const res = mapErrorToResponse(err, PLACEHOLDER_REQUEST, INFO);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: 'Internal Server Error'.length },
            });
        });
    });

    describe('unknown error mapping', () => {
        test('should map non-error object to 500 response with default message', () => {
            const res = mapErrorToResponse({}, PLACEHOLDER_REQUEST, INFO);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: 'Internal Server Error'.length },
            });
        });

        test('should map null to 500 response with default message', () => {
            const res = mapErrorToResponse(null, PLACEHOLDER_REQUEST, INFO);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });

        test('should map string to 500 response', () => {
            const res = mapErrorToResponse('something went wrong', PLACEHOLDER_REQUEST, INFO);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });
    });
});

describe('ResponseWriter.write()', () => {
    let conn: TCPConnection;

    beforeEach(() => {
        conn = mockedTCPConnection();
    });

    describe('valid response', () => {
        test('should write response to connection', async () => {
            const response: HttpResponse = {
                code: 200,
                version: HttpVersion.HTTP_1_1,
                body: new MemoryBodyReader(Buffer.from('hello')),
                headers: new Map(),
            };

            await ResponseWriter.write(conn, response);
            expect(conn.write).toHaveBeenCalled();
        });

        test('should set content-length header before writing', async () => {
            const response: HttpResponse = {
                code: 200,
                version: HttpVersion.HTTP_1_1,
                body: new MemoryBodyReader(Buffer.from('hello')),
                headers: new Map(),
            };

            await ResponseWriter.write(conn, response);
            expect(response.headers.get('content-length')).toBe('5');
        });

        test('should write body content to connection', async () => {
            const response: HttpResponse = {
                code: 200,
                version: HttpVersion.HTTP_1_1,
                body: new MemoryBodyReader(Buffer.from('hello')),
                headers: new Map(),
            };

            await ResponseWriter.write(conn, response);
            expect(conn.write).toHaveBeenCalledTimes(2); // header + body
        });
    });

    describe('chunked response', () => {
        test('should use chunked transfer-encoding when body length is unknown', async () => {
            const response: HttpResponse = {
                code: 200,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: {
                    length: -1,
                    read: async () => null,
                },
            };

            await expect(ResponseWriter.write(conn, response)).resolves.toBeUndefined();
            expect(response.headers.get('transfer-encoding')).toBe('chunked');
        });
    });
});