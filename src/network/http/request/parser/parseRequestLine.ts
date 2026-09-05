import {splitBuffer} from "../../../mem/bytes.js";
import Delimiter from "../../../common/constants.js";
import HttpError from "../../common/HttpError.js";
import {
    MAX_REQUEST_LINE_LENGTH,
    SUPPORTED_VERSIONS,
    VALID_METHODS,
} from "../../common/constants.js";

/** Parses an HTTP request-line into method / request-target / HTTP-version (RFC 9110 §3.2.1). */
export function parseRequestLine(line: Buffer): {method: string; url: string; version: string} {
    if (line.length > MAX_REQUEST_LINE_LENGTH)
        throw new HttpError(414, 'Request line too long');

    const parts = splitBuffer(line, Delimiter.SP);

    // Reject anything that isn't exactly `method SP target SP version`.
    // splitBuffer can yield >3 parts on trailing/embedded SP — both are malformed.
    if (parts.length !== 3)
        throw new HttpError(400, 'Malformed request line');

    const [rawMethod, rawUrl, rawVersion] = parts;

    if (!rawMethod?.length || !rawUrl?.length || !rawVersion?.length)
        throw new HttpError(400, 'Malformed request line');

    const method = rawMethod.toString();
    const url = rawUrl.toString('latin1');
    const version = rawVersion.toString();

    if (!VALID_METHODS.has(method))
        throw new HttpError(405, 'Method not allowed');
    if (!SUPPORTED_VERSIONS.includes(version))
        throw new HttpError(501, 'Http version not supported. supported version: 1.1');

    return {method, url, version};
}
