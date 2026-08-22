import { describe, test, expect, beforeEach } from 'vitest';
import HttpError from '../../../../src/network/http/common/HttpError.js';
import { mapErrorToResponse } from '../../../../src/network/http/response/mapErrorToResponse.js';
import { ResponseWriter } from '../../../../src/network/http/response/ResponseWriter.js';
import { HttpVersion } from '../../../../src/network/http/common/constants.js';
import { HttpResponse } from '../../../../src/network/http/common/types.js';
import MemoryBodyReader from '../../../../src/network/http/request/body/MemoryBodyReader.js';
import { mockedTCPConnection } from '../common/utils.js';
import {TCPConnection} from '../../../../src/network/tcp';

describe('mapErrorToResponse()', () => {

    describe('HttpError mapping', () => {
        test('should map HttpError code and message to response', () => {
            const err = new HttpError(422, 'Cannot parse request body content!');
            const res = mapErrorToResponse(err);

            expect(res).toMatchObject({
                code: 422,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: err.message.length },
            });
        });

        test('should use HttpError status code directly', () => {
            const err = new HttpError(404, 'Not found');
            const res = mapErrorToResponse(err);

            expect(res.code).toBe(404);
        });
    });

    describe('generic Error mapping', () => {
        test('should map Error to 500 response', () => {
            const err = new Error('Something went wrong!');
            const res = mapErrorToResponse(err);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: err.message.length },
            });
        });
    });

    describe('unknown error mapping', () => {
        test('should map non-error object to 500 response with default message', () => {
            const res = mapErrorToResponse({});

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
                body: { length: 'Webserver Internal Error'.length },
            });
        });

        test('should map null to 500 response with default message', () => {
            const res = mapErrorToResponse(null);

            expect(res).toMatchObject({
                code: 500,
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });

        test('should map string to 500 response', () => {
            const res = mapErrorToResponse('something went wrong');

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
            expect(conn.write).toHaveBeenCalledTimes(2); // headers + body
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