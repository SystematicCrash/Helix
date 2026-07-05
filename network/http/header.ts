import HttpError from "./HttpError";
import {
    HEADER_NAME_REGEX,
    HEADER_VALUE_REGEX,
    MANDATORY_HEADERS,
    MAX_HEADER_NAME_LENGTH,
    MAX_HEADER_VALUE_LENGTH
} from "./constants";

export function parseHeaders(rawHeaders: Buffer[]): Map<string, string> {
    const parsed = new Map<string, string>();

    for (const header of rawHeaders) {
        const entry = parseHeaderLine(header);
        if (!isValidHeader(entry)) throw new HttpError(400, 'bad headers');
        parsed.set(entry[0], entry[1]);
    }

    checkMandatories(parsed);
    return parsed;
}

export function isValidHeader(header: [string, string]): boolean {
    const [name, value] = header;
    return isValidHeaderName(name) && !isValidHeaderValue(value);
}

function checkMandatories(headers: Map<string, string>): void {
    for (const mandatory of MANDATORY_HEADERS) {
        if (!headers.has(mandatory))
            throw new HttpError(400, `${mandatory} header must be present`);
    }
}

function parseHeaderLine(rawHeader: Buffer): [string, string] {
    const idx = rawHeader.indexOf(':');
    if (idx === -1) throw new HttpError(400, 'bad headers');

    const name   = rawHeader.subarray(0, idx).toString().trim().toLowerCase();
    const value = rawHeader.subarray(idx + 1).toString().trim();

    return [name, value];
}

function isValidHeaderName(name: string): boolean {
    return HEADER_NAME_REGEX.test(name) && name.length <= MAX_HEADER_NAME_LENGTH;
}

function isValidHeaderValue(value: string): boolean {
    return HEADER_VALUE_REGEX.test(value) && value.length <= MAX_HEADER_VALUE_LENGTH;
}