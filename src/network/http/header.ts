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
        if (!isValidHeader(entry)) throw new HttpError(400, 'Bad Headers');
        parsed.set(entry[0], entry[1]);
    }

    checkMandatories(parsed);
    return parsed;
}

function parseHeaderLine(rawHeader: Buffer): [string, string] {
    const idx = rawHeader.indexOf(':');
    if (idx === -1) throw new HttpError(400, 'Bad Headers');

    const name   = rawHeader.subarray(0, idx).toString().trim().toLowerCase();
    const value = rawHeader.subarray(idx + 1).toString('latin1').trim();

    return [name, value];
}

function isValidHeader(header: [string, string]): boolean {
    const [name, value] = header;
    const validName = HEADER_NAME_REGEX.test(name) && name.length <= MAX_HEADER_NAME_LENGTH;
    const validValue = HEADER_VALUE_REGEX.test(value) && value.length <= MAX_HEADER_VALUE_LENGTH;

    return validName && validValue;
}

function checkMandatories(headers: Map<string, string>): void {
    for (const mandatory of MANDATORY_HEADERS) {
        if (!headers.has(mandatory))
            throw new HttpError(400, `${mandatory} header must be present`);
    }
}