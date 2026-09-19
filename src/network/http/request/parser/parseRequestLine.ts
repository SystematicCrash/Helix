import {splitBuffer} from "../../../../buffer/bytes.js";
import {SP} from "../../../common/constants.js";
import HttpError from "../../common/HttpError.js";
import {
    HttpVersion,
    MAX_REQUEST_LINE_LENGTH,
    SUPPORTED_VERSIONS,
    VALID_METHODS,
} from "../../common/constants.js";

/** Parses an HTTP request-line into method / request-target / HTTP-version (RFC 9110 §3.2.1). */
export function parseRequestLine(line: Buffer): { method: string; url: string; version: string } {
    if (line.length > MAX_REQUEST_LINE_LENGTH)
        throw new HttpError(414, 'URI Too Long');

    const parts = splitBuffer(line, SP, true);

    if (parts.length !== 3) {
        throw HttpError.invalidRequestLine();
    }

    const [rawMethod, rawUrl, rawVersion] = parts;

    if (!rawMethod?.length || !rawUrl?.length || !rawVersion?.length) {
        throw HttpError.invalidRequestLine();
    }
    const method = rawMethod.toString();
    const url = rawUrl.toString('latin1');
    const version = rawVersion.toString();

    if (!VALID_METHODS.has(method)) {
        throw HttpError.methodNotAllowed();
    }
    if (!SUPPORTED_VERSIONS.includes(version as HttpVersion))
        throw new HttpError(505, "HTTP Version Not Supported", true);

    return {method, url, version};
}
