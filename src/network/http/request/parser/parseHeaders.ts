import HttpError from "../common/HttpError.js";
import {
    HEADER_NAME_REGEX,
    HEADER_VALUE_REGEX, HttpHeader,
    MANDATORY_HEADERS,
    MAX_HEADER_NAME_LENGTH,
    MAX_HEADER_VALUE_LENGTH, UNIQUE_HEADERS
} from "../common/constants.js";

/** Parses and validates raw header buffers into a name/value map. */
export function parseHeaders(rawHeaders: Buffer[]): Map<string, string> {
    const parsed = new Map<string, string>();

    for (const header of rawHeaders) {
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
    }

    checkMandatories(parsed);
    return parsed;
}

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
    const validValue = HEADER_VALUE_REGEX.test(value) && value.length <= MAX_HEADER_VALUE_LENGTH;

    return validName && validValue;
}

/** Throws a 400 error if any mandatory header (e.g. Host) is missing from the parsed map. */
function checkMandatories(headers: Map<string, string>): void {
    for (const mandatory of MANDATORY_HEADERS) {
        if (!headers.has(mandatory as string))
            throw new HttpError(400, `${mandatory} header must be present`);
    }
}
