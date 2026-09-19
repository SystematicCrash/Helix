import { describe, expect, test } from 'vitest';
import { parseRangeHeader } from '../../../../../src/network/http/request/parser/parseRange.js';

describe('parseRangeHeader', () => {
    test('should parse valid range bytes=0-499 as an array', () => {
        expect(parseRangeHeader('bytes=0-499')).toEqual([{ start: 0, end: 499 }]);
    });

    test('should parse open-ended range bytes=500- as an array', () => {
        expect(parseRangeHeader('bytes=500-')).toEqual([{ start: 500, end: -1 }]);
    });

    test('should parse suffix range bytes=-500 as an array', () => {
        expect(parseRangeHeader('bytes=-500')).toEqual([{ end: -1, suffix: 500 }]);
    });

    test('should parse multiple ranges bytes=0-49,50-99', () => {
        expect(parseRangeHeader('bytes=0-49, 50-99')).toEqual([
            { start: 0, end: 49 },
            { start: 50, end: 99 }
        ]);
    });

    test('should return null on invalid format (missing bytes=)', () => {
        expect(parseRangeHeader('0-499')).toBeNull();
    });

    test('should return null on malformed ranges', () => {
        expect(parseRangeHeader('bytes=0-499-500')).toBeNull();
        expect(parseRangeHeader('bytes=abc-def')).toBeNull();
        expect(parseRangeHeader('bytes=500-499')).toBeNull();
        expect(parseRangeHeader('bytes=-1-10')).toBeNull();
    });

    test('should return null if range is empty', () => {
        expect(parseRangeHeader('bytes=')).toBeNull();
        expect(parseRangeHeader('bytes=,')).toBeNull();
    });
});
