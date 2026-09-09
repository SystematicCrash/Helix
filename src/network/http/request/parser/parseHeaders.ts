import HttpError from "../../common/HttpError.js";
import {
    HEADER_NAME_REGEX,
    HEADER_VALUE_REGEX, HttpHeader,
    MANDATORY_HEADERS,
    MAX_HEADER_NAME_LENGTH,
    MAX_HEADER_VALUE_LENGTH, UNIQUE_HEADERS
} from "../../common/constants.js";
import {HTAB, SP} from "../../../common/constants.js";

/** Parses and validates raw header buffers into a name/value map.
 * Supports obs-fold (RFC 9112 §5.2): a line starting with SP/HTAB continues
 * the previous header's value; the fold is replaced with a single SP. */
export function parseHeaders(rawHeaders: Buffer[]): Map<string, string> {
    const parsed = new Map<string, string>();

    let current: [string, string] | null = null;
    for (const header of rawHeaders) {
        if (isObsFold(header)) {
            const value = applyObsFold(current, header);
            if (current !== null) {
                current[1] = value;
                parsed.set(current[0], value);
            }
            continue;
        }

        const entry = parseHeaderLine(header);
        if (!isValidHeader(entry)) {
            throw new HttpError(400, 'Bad Headers');
        }

        const existing = parsed.get(entry[0]);
        if (existing !== undefined) {
            if (UNIQUE_HEADERS.includes(entry[0] as HttpHeader)) {
                throw new HttpError(400, 'Bad Headers');
            }
            entry[1] = concatenateValues(entry[0], existing, entry[1]);
        }

        parsed.set(entry[0], entry[1]);
        current = entry;
    }

    checkMandatories(parsed);
    return parsed;
}

/** Unfolds an obs-fold continuation line onto the previous header's value.
 * Returns the new concatenated value string; the caller is responsible for
 * updating the parsed-headers map. Throws 400 if a continuation appears with
 * no prior header, has no content, or produces an invalid value. */
function applyObsFold(current: [string, string] | null, header: Buffer): string {
    if (current === null || header.toString('latin1').trim().length === 0) {
        throw new HttpError(400, 'Bad Headers');
    }

    const unfolded = `${current[1]} ${trimValue(header)}`;
    if (!isValidValue(unfolded)) {
        throw new HttpError(400, 'Bad Headers');
    }

    return unfolded;
}

/** Returns true when the line starts with SP or HTAB, marking an obs-fold continuation. */
function isObsFold(rawHeader: Buffer): boolean {
    return rawHeader.length > 0 && (rawHeader[0] === SP[0] || rawHeader[0] === HTAB[0]);
}

/** Decodes and trims a raw header-line buffer into its value string. */
function trimValue(rawHeader: Buffer): string {
    return rawHeader.toString('latin1').trim();
}

/** Joins a duplicated non-unique header's previous and new values into one string. */
function concatenateValues(name: string, value: string, newValue: string): string {
    if (name === HttpHeader.Cookie) {
        return `${value}; ${newValue}`;
    } else {
        return `${value}, ${newValue}`;
    }
}

/** Splits a single raw header buffer on the first colon into a normalized name/value pair. */
function parseHeaderLine(rawHeader: Buffer): [string, string] {
    const idx = rawHeader.indexOf(':');
    if (idx === -1) throw new HttpError(400, 'Bad Headers');

    const name   = rawHeader.subarray(0, idx).toString().trim().toLowerCase();
    const value = rawHeader.subarray(idx + 1).toString('latin1').trim();

    return [name, value];
}

/** Returns true if both the header name and value pass their respective format checks. */
function isValidHeader(header: [string, string]): boolean {
    const [name, value] = header;
    const validName = HEADER_NAME_REGEX.test(name) && name.length <= MAX_HEADER_NAME_LENGTH;

    return validName && isValidValue(value);
}

/** Returns true if the value passes the charset regex and the length limit. */
function isValidValue(value: string): boolean {
    return HEADER_VALUE_REGEX.test(value) && value.length <= MAX_HEADER_VALUE_LENGTH;
}

/** Throws a 400 error if any mandatory header (e.g. Host) is missing from the parsed map. */
function checkMandatories(headers: Map<string, string>): void {
    for (const mandatory of MANDATORY_HEADERS) {
        if (!headers.has(mandatory as string))
            throw new HttpError(400, `${mandatory} header must be present`);
    }
}
