import {describe, expect, test} from "vitest";
import {Buffer} from "node:buffer";
import {splitBuffer, stripBuffer} from "../../../../src/network/mem/bytes.js";
import Delimiter from "../../../../src/network/common/constants.js";

describe("Bytes Utility Functionalities", () => {

    describe("splitBuffer()", () => {

        test("should split buffer with given delimiter", () => {
            const buffer = Buffer.from('first\nsecond\nthird');

            const parts = splitBuffer(buffer, Delimiter.LF);
            const partsStr = parts.map(p => p.toString());

            expect(parts.length).toEqual(3);
            expect(partsStr).toContain('first');
            expect(partsStr).toContain('second');
            expect(partsStr).toContain('third');
        });

        test("should not touch buffer when delimiter does not exist", () => {
            const buffer = Buffer.from('first\nsecond\nthird');
            const parts = splitBuffer(buffer, Delimiter.CR);

            expect(parts[0]).toEqual(buffer);
        });
    });

    describe("stripBuffer()", () => {

        test("should remove all leading and trailing occurrences of a delimiter from buffer", () => {
            const buffer = Buffer.from('\r\nSome Content In Between\r\n');

            const stripped = stripBuffer(buffer, Delimiter.CRLF);
            const strippedStr = stripped.toString();

            expect(strippedStr).not.toContain(Delimiter.CRLF);
        });

        test("should not touch buffer when delimiter does not exist", () => {
            const buffer = Buffer.from('\r\nSome Content In Between\r\n');

            const stripped = stripBuffer(buffer, Delimiter.SP);

            expect(stripped).toEqual(buffer);
        })
    });
});