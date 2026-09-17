import { describe, expect, test } from 'vitest';
import { parseRangeHeader } from '../../../../../src/network/http/request/parser/parseRange.js';

describe('parseRangeHeader', () => {
    test('should parse valid range bytes=0-499', () => {
        expect(parseRangeHeader('bytes=0-499')).toEqual({ start: 0, end: 499 });
    });

    test('should parse open-ended range bytes=500-', () => {
        expect(parseRangeHeader('bytes=500-')).toEqual({ start: 500, end: -1 });
    });

    test('should return null on invalid format (missing bytes=)', () => {
        expect(parseRangeHeader('0-499')).toBeNull();
    });

    test('should return null on invalid range format (e.g. malformed parts)', () => {
        expect(parseRangeHeader('bytes=0-499-500')).toBeNull();
    });

    test('should return null on invalid start or end values', () => {
        expect(parseRangeHeader('bytes=abc-def')).toBeNull();
    });

    test('should return null on end < start', () => {
        expect(parseRangeHeader('bytes=500-499')).toBeNull();
    });

    test('should return null on negative start', () => {
        expect(parseRangeHeader('bytes=-1-10')).toBeNull();
    });

    test('should parse suffix range bytes=-500', () => {
        expect(parseRangeHeader('bytes=-500')).toEqual({ end: -1, suffix: 500 });
    });
});
