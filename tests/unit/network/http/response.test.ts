import {beforeEach, afterEach, expect, test, describe} from "vitest";
import HttpError from "../../../../src/network/http/HttpError.js";
import {mapErrorToResponse, writeResponse} from "../../../../src/network/http/response.js";
import {HttpVersion} from "../../../../src/network/http/constants.js";
import TCPConnection from "../../../../src/network/tcp/TCPConnection.js";
import {HttpResponse} from "../../../../src/network/http/types.js";
import {memoryReader} from "../../../../src/network/http/request.js";
import {mockedTCPConnection} from "../common/utils.js";

describe("Http Response", () => {
    describe("mapErrorToResponse()", () => {

        test('should correctly map HttpError to HttpResponse object', () => {
            const err = new HttpError(422, 'Cannot parse request body content!');
            const mappedRes = mapErrorToResponse(err);

            expect(mappedRes).toMatchObject({
                code: 422,
                body: {
                    length: err.message.length,
                },
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });

        test('should correctly map Error to HttpResponse object', () => {
            const err = new Error('Something went wrong!');
            const mappedRes = mapErrorToResponse(err);

            expect(mappedRes).toMatchObject({
                code: 500,
                body: {
                    length: err.message.length,
                },
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });

        test('should correctly map non-error object to HttpResponse object', () => {
            const errObj = {};
            const mappedRes = mapErrorToResponse(errObj);

            expect(mappedRes).toMatchObject({
                code: 500,
                body: {
                    length: 'Webserver Internal Error'.length,
                },
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            });
        });
    });

    describe('writeResponse()', () => {
        let conn: TCPConnection = mockedTCPConnection();

        test('should correctly write the response to the connection', async () => {
            const response: HttpResponse = {
                code: 200,
                version: HttpVersion.HTTP_1_1,
                body: memoryReader(Buffer.from('Hello')),
                headers: new Map(),
            };

            await writeResponse(conn, response);

            expect(conn.write).toHaveBeenCalled();
        });

        test('should throw when body length is less than 0 (for chunked transfer)', async () => {
            const response: HttpResponse = {
                code: 200,
                body: {
                    length: -1,
                    read: async () => {
                        return Buffer.from('Hello');
                    },
                },
                version: HttpVersion.HTTP_1_1,
                headers: new Map(),
            };

            const writePromise = writeResponse(conn, response);
            await expect(() => writePromise).rejects.toThrow();
        });

        test('should correctly set the content-length header before before writing response', async () => {
           const response: HttpResponse = {
               code: 200,
               body: memoryReader(Buffer.from("Hello")),
               version: HttpVersion.HTTP_1_1,
               headers: new Map(),
           };

           await writeResponse(conn, response);
           expect(response.headers.has('content-length')).toBe(true);
        });
    });
});