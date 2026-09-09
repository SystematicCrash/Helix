import {TOKEN_CHAR_CODES} from "./constants.js";
import {BS, DQ, HTAB, SP} from "../../common/constants.js";

/**
 * RFC 7230 generic parser primitives. Not tied to any single message part —
 * usable for header, chunk-ext, trailers, and any future RFC 7230 grammar.
 *
 * Implementation note: all char comparisons go through `String.charCodeAt(i)`,
 * which returns `number` (never `undefined`), so these helpers stay compatible
 * with `noUncheckedIndexedAccess` without using `!` assertions.
 */

/** Consumes optional beginning whitespace (SP/HTAB/Bad White Space) and returns the remainder. */
export function consumeBWS(s: string): string {
    const SP_CODE = SP[0]!;
    const HTAB_CODE = HTAB[0]!;
    let i;
    for (i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);
        if (code !== SP_CODE && code !== HTAB_CODE) break;
    }
    return s.slice(i);
}

/** Returns the length of the leading token run, or 0 if the first char isn't a token char. */
export function getTokenLength(s: string): number {
    let i = 0;
    while (i < s.length && TOKEN_CHAR_CODES.has(s.charCodeAt(i))) i++;
    return i;
}

/**
 * Parses a quoted-string starting with the opening `"` and returns its unescaped
 * content plus the number of input characters consumed (including the surrounding quotes).
 * Throws Error on unterminated or invalid quoted-pair input.
 */
export function consumeQuotedString(s: string): {value: string; consumed: number} {
    // s[0] === '"'
    const DQ_CODE = DQ[0]!;
    const BS_CODE = BS[0]!;
    let out = '';
    let i = 1;
    while (i < s.length) {
        const code = s.charCodeAt(i);
        if (code === BS_CODE) {
            if (i + 1 >= s.length) {
                throw new Error('Unterminated quoted-string');
            }
            out += s[i + 1];
            i += 2;
        } else if (code === DQ_CODE) {
            return {value: out, consumed: i + 1};
        } else {
            out += s[i];
            i++;
        }
    }
    throw new Error('Unterminated quoted-string');
}
