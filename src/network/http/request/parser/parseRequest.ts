import DynamicBuffer from "../../../../buffer/DynamicBuffer.js";
import HttpRequest from "../HttpRequest.js";
import {HEADER_TERMINATOR, MAX_HEADER_LENGTH} from "../../common/constants.js";
import HttpError from "../../common/HttpError.js";

/**
 * Scans the buffer for a complete HTTP header block (CRLF * 2) and returns a parsed request.
 * Throws HttpError(413) if the buffered header data exceeds the maximum allowed length.
 */
export function parseRequest(buf: DynamicBuffer): HttpRequest | null {
    const idx = buf.getView(buf.length).indexOf(HEADER_TERMINATOR);

    if (idx < 0) {
        if (buf.length > MAX_HEADER_LENGTH) {
            throw HttpError.contentTooLarge('Headers too large');
        }
        return null;
    }

    const msg = HttpRequest.from(buf.getView(idx));
    buf.clear(idx + HEADER_TERMINATOR.length);
    return msg;
}
