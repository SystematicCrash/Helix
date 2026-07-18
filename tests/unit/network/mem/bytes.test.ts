import { describe, expect, test } from 'vitest';
import { splitBuffer, stripBuffer } from '../../../../src/network/mem/bytes.js';
import Delimiter from '../../../../src/network/common/constants.js';

describe('splitBuffer()', () => {

    test('should split buffer into parts using the given delimiter', () => {
        const buf = Buffer.from('first\nsecond\nthird');
        const parts = splitBuffer(buf, Delimiter.LF).map(p => p.toString());

        expect(parts).toHaveLength(3);
        expect(parts).toContain('first');
        expect(parts).toContain('second');
        expect(parts).toContain('third');
    });

    test('should return original buffer as single part when delimiter is not found', () => {
        const buf = Buffer.from('first\nsecond\nthird');
        const parts = splitBuffer(buf, Delimiter.CR);

        expect(parts).toHaveLength(1);
        expect(parts[0]).toEqual(buf);
    });

    test('should return the empty buffer when given buffer is empty', () => {
        const parts = splitBuffer(Buffer.alloc(0), Delimiter.LF);
        expect(parts).toHaveLength(1);
    });

    test('should handle consecutive delimiters', () => {
        const buf = Buffer.from('first\n\nthird');
        const parts = splitBuffer(buf, Delimiter.LF).map(p => p.toString());

        expect(parts).toHaveLength(3);
        expect(parts[1]).toBe('');
    });

    test('should handle delimiter at start of buffer', () => {
        const buf = Buffer.from('\nfirst\nsecond');
        const parts = splitBuffer(buf, Delimiter.LF).map(p => p.toString());

        expect(parts[0]).toBe('');
    });

    test('should handle delimiter at end of buffer', () => {
        const buf = Buffer.from('first\nsecond\n');
        const parts = splitBuffer(buf, Delimiter.LF).map(p => p.toString());

        expect(parts[parts.length - 1]).toBe('');
    });
});

describe('stripBuffer()', () => {

    test('should remove leading and trailing delimiter occurrences', () => {
        const buf = Buffer.from('\r\nSome Content In Between\r\n');
        const stripped = stripBuffer(buf, Delimiter.CRLF).toString();

        expect(stripped).toBe('Some Content In Between');
    });

    test('should return original buffer when delimiter is not found', () => {
        const buf = Buffer.from('\r\nSome Content In Between\r\n');
        const stripped = stripBuffer(buf, Delimiter.SP);

        expect(stripped).toEqual(buf);
    });

    test('should return empty buffer when input is only delimiters', () => {
        const buf = Buffer.from('\r\n\r\n\r\n');
        const stripped = stripBuffer(buf, Delimiter.CRLF);

        expect(stripped.length).toBe(0);
    });

    test('should not strip delimiters in the middle of buffer', () => {
        const buf = Buffer.from('\r\nfirst\r\nsecond\r\n');
        const stripped = stripBuffer(buf, Delimiter.CRLF).toString();

        expect(stripped).toBe('first\r\nsecond');
    });

    test('should handle empty buffer', () => {
        const stripped = stripBuffer(Buffer.alloc(0), Delimiter.CRLF);
        expect(stripped.length).toBe(0);
    });
});