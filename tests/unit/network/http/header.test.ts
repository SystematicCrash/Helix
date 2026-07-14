import {beforeEach, afterEach, test, describe, expect} from "vitest";
import {parseHeaders} from "../../../../src/network/http/header.js";
import HttpError from "../../../../src/network/http/HttpError.js";
import {MAX_HEADER_NAME_LENGTH, MAX_HEADER_VALUE_LENGTH} from "../../../../src/network/http/constants.js";

describe("Http Headers", () => {
    describe("parseHeaders()", () => {

        test('should parse raw headers to map of key-values', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from('Content-Length: 10089'),
                Buffer.from('Content-Type: application/json'),
            ];

            const parsed = parseHeaders(rawHeaders);

            expect(parsed.get('host')).toBe('helix.com');
            expect(parsed.get('content-length')).toBe('10089');
            expect(parsed.get('content-type')).toBe('application/json');
        });

        test('should throw when mandatory header does not present', () => {
            const rawHeaders = [
                // no Host header
                Buffer.from('Content-Length: 10089'),
                Buffer.from('Content-Type: application/json'),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "host header must be present"));
        });

        test('should throw when header format is invalid', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from('Secret = kjl08#slkj3j-lSd432'),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "Bad Headers"));
        });

        test('should throw when header name is invalid', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from('Custom Header: value'),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "Bad Headers"));
        });

        test('should throw when header value is invalid', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from('Custom: Hello\nWorld'),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "Bad Headers"));
        });

        test('should throw when header name is too long', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from(`${'x'.repeat(MAX_HEADER_NAME_LENGTH + 1)}: value`),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "Bad Headers"));
        });

        test('should throw when header value is too long', () => {
            const rawHeaders = [
                Buffer.from('Host: helix.com'),
                Buffer.from(`Custom: ${'x'.repeat(MAX_HEADER_VALUE_LENGTH + 1)}`),
            ];

            expect(() => parseHeaders(rawHeaders))
                .toThrow(new HttpError(400, "Bad Headers"));
        });

    });
});