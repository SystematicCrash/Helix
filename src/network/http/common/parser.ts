import {HEADER_NAME_REGEX} from "./constants.js";

/**
 * RFC 7230 generic parser primitives. Not tied to any single message part —
 * usable for headers, chunk-ext, trailers, and any future RFC 7230 grammar.
 */

/** Consumes optional whitespace (SP/HTAB) and returns the remainder. */
export function consumeBWS(s: string): string {
    let i = 0;
    while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i++;
    return s.slice(i);
}

/** Returns the length of the leading token run, or 0 if the first char isn't a token char. */
export function scanToken(s: string): number {
    let i = 0;
    while (i < s.length && HEADER_NAME_REGEX.test(s[i]!)) i++;
    return i;
}

/**
 * Parses a quoted-string starting with the opening `"` and returns its unescaped
 * content plus the number of input characters consumed (including the surrounding quotes).
 * Throws Error on unterminated or invalid quoted-pair input.
 */
export function consumeQuotedString(s: string): {value: string; consumed: number} {
    // s[0] === '"'
    let out = '';
    let i = 1;
    while (i < s.length) {
        const c = s[i]!;
        if (c === '\\') {
            if (i + 1 >= s.length) {
                throw new Error('Unterminated quoted-string');
            }
            out += s[i + 1];
            i += 2;
        } else if (c === '"') {
            return {value: out, consumed: i + 1};
        } else {
            out += c;
            i++;
        }
    }
    throw new Error('Unterminated quoted-string');
}
