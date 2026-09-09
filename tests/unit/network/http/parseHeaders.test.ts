import { describe, expect, test } from 'vitest';
import { parseHeaders } from '../../../../src/network/http/request/parser/parseHeaders.js';
import HttpError from '../../../../src/network/http/common/HttpError.js';
import { MAX_HEADER_VALUE_LENGTH } from '../../../../src/network/http/common/constants.js';

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
            const parsed = parseHeaders(raw('Host: example.com', 'Content-Type : text/html'));
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

    describe('obs-fold (RFC 9112 §5.2)', () => {
        test('should unfold a single space-indented continuation line', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: first', '  second'));
            expect(parsed.get('x-foo')).toBe('first second');
        });

        test('should unfold a tab-indented continuation line', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: first', '\tsecond'));
            expect(parsed.get('x-foo')).toBe('first second');
        });

        test('should collapse leading whitespace of the continuation into a single space', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: first', ' \t  second'));
            expect(parsed.get('x-foo')).toBe('first second');
        });

        test('should unfold multiple consecutive continuation lines in order', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', ' b', ' c', ' d'));
            expect(parsed.get('x-foo')).toBe('a b c d');
        });

        test('should unfold a continuation line onto the Host header', () => {
            const parsed = parseHeaders(raw('Host: example.com', ' \tmore-of-host'));
            expect(parsed.get('host')).toBe('example.com more-of-host');
        });

        test('should allow a new normal header after a continuation', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', ' b', 'Accept: text/html'));
            expect(parsed.get('x-foo')).toBe('a b');
            expect(parsed.get('accept')).toBe('text/html');
        });

        test('should throw 400 when the first header line is a continuation', () => {
            expect(() => parseHeaders(raw(' continued-value')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when the first line is a tab continuation', () => {
            expect(() => parseHeaders(raw('\tcontinued-value')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should throw 400 when a continuation line contains only whitespace', () => {
            expect(() => parseHeaders(raw('Host: example.com', 'X-Foo: first', '   ')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should treat a colon inside a continuation as value data, not a new header', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: first', ' Evil: header'));
            expect(parsed.get('x-foo')).toBe('first Evil: header');
            expect(parsed.has('evil')).toBe(false);
        });

        test('should throw 400 when the unfolded value exceeds MAX_HEADER_VALUE_LENGTH', () => {
            const base = 'x'.repeat(MAX_HEADER_VALUE_LENGTH);
            expect(() => parseHeaders(raw('Host: example.com', 'X-Foo: ' + base, ' x')))
                .toThrow(new HttpError(400, 'Bad Headers'));
        });

        test('should accept an unfolded value exactly at MAX_HEADER_VALUE_LENGTH', () => {
            // "X-Foo: " + 7992 chars, then " " + 7 more = 8000 total.
            const base = 'y'.repeat(MAX_HEADER_VALUE_LENGTH - 8);
            const tail = 'z'.repeat(7);
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: ' + base, ' ' + tail));
            expect(parsed.get('x-foo')?.length).toBe(MAX_HEADER_VALUE_LENGTH);
        });

        test('should unfold only the immediately preceding header', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', 'X-Bar: b', ' c'));
            expect(parsed.get('x-foo')).toBe('a');
            expect(parsed.get('x-bar')).toBe('b c');
        });

        test('should unfold before concatenating a duplicated non-unique header', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'X-Foo: a', ' b', 'X-Foo: c'));
            expect(parsed.get('x-foo')).toBe('a b, c');
        });

        test('should unfold a continuation containing visible ASCII text', () => {
            const parsed = parseHeaders(raw('Host: example.com', 'Accept: text/', ' html'));
            expect(parsed.get('accept')).toBe('text/ html');
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
