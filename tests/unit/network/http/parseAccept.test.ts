import { describe, test, expect } from "vitest";
import { parseAcceptHeader } from "../../../../src/network/http/request/parser/parseAccept.js";
import { ContentType } from "../../../../src/network/http/common/constants.js";

describe("parseAcceptHeader()", () => {
    describe("empty and invalid inputs", () => {
        test("should return empty array when header is undefined", () => {
            expect(parseAcceptHeader(undefined)).toEqual([]);
        });

        test("should return empty array when header is empty string", () => {
            expect(parseAcceptHeader("")).toEqual([]);
        });

        test("should return empty array for whitespace-only strings", () => {
            expect(parseAcceptHeader("   ")).toEqual([]);
            expect(parseAcceptHeader("\t  \r\n")).toEqual([]);
        });

        test("should return empty array for lone commas and trailing commas", () => {
            expect(parseAcceptHeader(",,,")).toEqual([]);
            expect(parseAcceptHeader(" , , , ")).toEqual([]);
        });
    });

    describe("filtering unrecognized MIME types and wildcards", () => {
        test("should drop unknown MIME types not in ContentType enum", () => {
            const header = "application/x-custom, image/vnd.microsoft.icon, audio/mp3";
            expect(parseAcceptHeader(header)).toEqual([]);
        });

        test("should drop wildcards like */* and text/*", () => {
            const header = "*/*, text/*, application/*";
            expect(parseAcceptHeader(header)).toEqual([]);
        });

        test("should retain valid MIME types while discarding unrecognized ones", () => {
            const header = "application/x-custom, application/json, text/unknown, text/html";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.Json,
                ContentType.TextHtml,
            ]);
        });
    });

    describe("default q-values (implicit 1.0)", () => {
        test("should parse a single recognized MIME type with implicit q=1.0", () => {
            expect(parseAcceptHeader("application/json")).toEqual([
                ContentType.Json,
            ]);
        });

        test("should parse multiple types preserving original order on identical q=1.0 (stable sort)", () => {
            const header = "text/html, application/json, text/plain";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
                ContentType.TextPlain,
            ]);
        });
    });

    describe("explicit q-value parsing and ordering", () => {
        test("should sort descending based on explicit q-values", () => {
            const header = "text/plain;q=0.3, text/html;q=0.9, application/json;q=0.7";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
                ContentType.TextPlain,
            ]);
        });

        test("should place implicit q=1.0 ahead of explicit lower q-values", () => {
            const header = "application/json;q=0.8, text/html, text/plain;q=0.5";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
                ContentType.TextPlain,
            ]);
        });

        test("should preserve stable index order when multiple types have equal explicit q-values", () => {
            const header = "application/json;q=0.7, text/plain;q=0.7, text/html;q=0.9";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
                ContentType.TextPlain,
            ]);
        });

        test("should handle integer and fractional q-value formats (e.g., q=1, q=0.5, q=0.500)", () => {
            const header = "text/plain;q=1, application/json;q=0.800, text/html;q=0.85";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextPlain,
                ContentType.TextHtml,
                ContentType.Json,
            ]);
        });
    });

    describe("q=0 rejection", () => {
        test("should completely discard types with explicit q=0", () => {
            const header = "text/html;q=0, application/json;q=0.8";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.Json,
            ]);
        });

        test("should discard types with q=0.0 and q=0.000", () => {
            const header = "application/json;q=0.0, text/plain;q=0.000, text/html;q=0.5";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
            ]);
        });

        test("should return empty array if all types are rejected with q=0", () => {
            const header = "application/json;q=0, text/html;q=0";
            expect(parseAcceptHeader(header)).toEqual([]);
        });
    });

    describe("whitespace, casing, and parameter edge cases", () => {
        test("should handle arbitrary whitespace around commas and semicolons", () => {
            const header = "  application/json  ;  q=0.8  ,   text/html ; q=0.9  ";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
            ]);
        });

        test("should parse case-insensitively for MIME types and q-parameters", () => {
            const header = "APPLICATION/JSON;Q=0.7, TEXT/HTML;q=0.9";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
            ]);
        });

        test("should ignore extra media-type parameters and extract q-value properly", () => {
            const header = "application/json;charset=utf-8;q=0.8, text/html;level=1;q=0.95";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.Json,
            ]);
        });

        test("should fall back to default q=1.0 when q-value is malformed or not a number", () => {
            const header = "application/json;q=invalid, text/html;q=0.5";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.Json,
                ContentType.TextHtml,
            ]);
        });

        test("should fall back to default q=1.0 when q-value is out of bounds (> 1 or < 0)", () => {
            const header = "application/json;q=1.5, text/html;q=0.8";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.Json,
                ContentType.TextHtml,
            ]);
        });
    });

    describe("typical real-world browser accept headers", () => {
        test("should correctly prioritize standard browser Accept string", () => {
            const header = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.TextHtml,
                ContentType.ImageWebp,
                ContentType.Xml,
            ]);
        });

        test("should prioritize client JSON API request correctly", () => {
            const header = "application/json, text/plain;q=0.5, */*;q=0.1";
            expect(parseAcceptHeader(header)).toEqual([
                ContentType.Json,
                ContentType.TextPlain,
            ]);
        });
    });
});