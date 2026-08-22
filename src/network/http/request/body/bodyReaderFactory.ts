import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import HttpError from "../../common/HttpError.js";
import {HttpHeader, HttpMethod} from "../../common/constants.js";
import {BodyReader, HttpRequest} from "../../common/types.js";
import FixedBodyReader from "./FixedBodyReader.js";
import ChunkedBodyReader from "./ChunkedBodyReader.js";
import EOFBodyReader from "./EOFBodyReader.js";

/** Selects the appropriate BodyReader based on Content-Length, Transfer-Encoding, or EOF. */
export function getReader(conn: TCPConnection, buf: DynamicBuffer, request: HttpRequest): BodyReader {
    const bodyAllowed = isBodyAllowed(request);
    const bodyLen = getBodyLength(request);
    const chunked = getTransferEncoding(request) === 'chunked';

    if (bodyLen > 0 && chunked)
        throw new HttpError(400, 'Bad Request');
    if (!bodyAllowed && (bodyLen > 0 || chunked))
        throw new HttpError(400, 'Http body not allowed');

    if (bodyLen > 0) return new FixedBodyReader(conn, buf, bodyLen);
    else if (chunked) return new ChunkedBodyReader(conn, buf);
    else return new EOFBodyReader(conn, buf);
}

/** Extracts and parses the Content-Length header value, returning -1 if absent. */
function getBodyLength(request: HttpRequest): number {
    let bodyLen = -1;
    const contentLen = request.headers.get(HttpHeader.ContentLength);

    if (contentLen) {
        bodyLen = +contentLen;
        if (isNaN(bodyLen)) {
            throw new HttpError(400, 'Invalid Content-Length');
        }
    }
    return bodyLen;
}

/** Returns the Transfer-Encoding header value, or null if not present. */
function getTransferEncoding(request: HttpRequest): string | null {
    const transferEn = request.headers.get(HttpHeader.TransferEncoding);
    return transferEn ? transferEn : null;
}

/** Returns false for methods that must not carry a body (GET, HEAD). */
function isBodyAllowed(request: HttpRequest): boolean {
    return request.method !== HttpMethod.GET && request.method !== HttpMethod.HEAD;
}
