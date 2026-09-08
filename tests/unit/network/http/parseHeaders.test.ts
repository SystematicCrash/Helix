import { describe, expect, test } from 'vitest';
import { parseHeaders } from '../../../../src/network/http/request/parser/parseHeaders.js';
import HttpError from '../../../../src/network/http/common/HttpError.js';

/** Builds a raw header buffer list from `Name: value` strings. */
function raw(...lines: string[]): Buffer[] {
    return lines.map(line => Buffer.from(line));
}

describe('parseHeaders()', () => {

    describe('basic parsing', () => {
        test('should parse a single header into the map', () => {
            const parsed = parseHeaders(raw('Host: example.com'));
            expect(parsed.get('host')).toBe('example.com');
        });

        test('should lowercase and trim the header name', () => {
            const parsed = parseHeaders(raw('Host: example.com', '  Content-Type : text/html'));
            expect(parsed.get('content-type')).toBe('text/html');
        });

        test('should trim the header value', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'Accept:   application/json  '));
            expect(parsed.get('accept')).toBe('application/json');
        });

        test('should throw 400 when the mandatory Host header is missing', () => {
            expect(() => parseHeaders(raw('Accept: application/json')))
                .toThrow(new HttpError(400, 'host header must be present'));
        });
    });

    describe('duplicated unique headers', () => {
        test('should throw 400 when a unique header is duplicated', () => {
            expect(() => parseHeaders(raw('Host: a', 'Host: b')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when Content-Length is duplicated', () => {
            expect(() => parseHeaders(raw('Content-Length: 5', 'Content-Length: 6')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when Transfer-Encoding is duplicated', () => {
            expect(() => parseHeaders(raw('Transfer-Encoding: chunked', 'Transfer-Encoding: chunked')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });
    });

    describe('duplicated non-unique headers (comma concatenation)', () => {
        test('should concatenate values of a duplicated non-unique header with comma+space', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', 'X-Foo: b'));
            expect(parsed.get('x-foo')).toBe('a, b');
        });

        test('should concatenate three values in order', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', 'X-Foo: b', 'X-Foo: c'));
            expect(parsed.get('x-foo')).toBe('a, b, c');
        });

        test('should concatenate Cookie values with semicolon+space', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'Cookie: a=1', 'Cookie: b=2'));
            expect(parsed.get('cookie')).toBe('a=1; b=2');
        });
    });

    describe('invalid headers', () => {
        test('should throw 400 when a header line has no colon', () => {
            expect(() => parseHeaders(raw('NoColonHere')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when the header name is empty', () => {
            expect(() => parseHeaders(raw(': value')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when the header value is empty', () => {
            expect(() => parseHeaders(raw('Accept:')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when the header name is too long', () => {
            const longName = 'x'.repeat(101);
            expect(() => parseHeaders(raw(`${longName}: value`)))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when the header value is too long', () => {
            const longValue = 'x'.repeat(8001);
            expect(() => parseHeaders(raw(`X-Foo: ${longValue}`)))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });
    });
});
