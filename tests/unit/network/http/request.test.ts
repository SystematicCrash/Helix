import {beforeEach, afterEach, test, describe, expect} from "vitest";
import {getReader, parseRequest} from "../../../../src/network/http/request.js";
import HttpError from "../../../../src/network/http/HttpError.js";
import {mockedTCPConnection} from "../common/utils.js";
import DynamicBuffer from "../../../../src/network/mem/DynamicBuffer.js";
import {HttpRequest} from "../../../../src/network/http/types.js";

describe("Http Request", () => {

    describe("parseRequest()", () => {

        test("should wrap raw request bytes to HttpRequest object", () => {
            const rawRequest = Buffer.from("POST /user/messages HTTP/1.1\r\nHost: example.com\r\nCustom: something");
            const parsed = parseRequest(rawRequest);

            expect(parsed).toMatchObject({
                method: "POST",
                url: "/user/messages",
                version: "HTTP/1.1",
                headers: new Map([
                    ['host', 'example.com'],
                    ['custom', 'something']
                ]),
            })
        });

        test("should throw when http method is invalid", () => {
            const rawRequest = Buffer.from("INVALID /user/messages HTTP/1.1\r\nHost: example.com");
            expect(() => parseRequest(rawRequest))
                .toThrow(new HttpError(405, 'Method not allowed'));
        });

        test("should throw when http version is not supported", () => {
            const rawRequest = Buffer.from("POST /user/messages HTTP/3\r\nHost: example.com");
            expect(() => parseRequest(rawRequest))
                .toThrow(new HttpError(501, 'Http version not supported. supported version: 1.1'));
        });
    });

    describe("getReader()", () => {

        test("should return fixed body reader when content-length is set", () => {
            const request: HttpRequest = {
                method: "POST",
                url: "/user/messages",
                version: "HTTP/1.1",
                headers: new Map([['content-length', '1000']]),
            };
            const reader = getReader(mockedTCPConnection(), new DynamicBuffer(), request);
            expect(reader).toMatchObject({
                length: 1000,
            });
        });

        test.todo("should return chunked body reader when transfer-encoding is set to chunked", () => {});

        test.todo("should return body reader until EOF when nothing is set", () => {});
    });

});