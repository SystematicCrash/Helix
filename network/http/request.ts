import DynamicBuffer from "../mem/DynamicBuffer";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import TCPConnection from "../tcp/TCPConnection";
import Delimiter from "../common/constants";
import {splitBuffer, stripBuffer} from "../mem/bytes";
import {parseHeaders} from "./header";

export function parseHttpRequest(data: Buffer): HttpRequest {
    data = stripBuffer(data, Delimiter.CRLF);

    const lines = splitBuffer(data, Delimiter.CRLF);
    const [method, url, version] = splitBuffer(lines[0], Delimiter.SP);
    const headers = parseHeaders(lines.slice(1, lines.length - 1));

    return {
        headers,
        url: url.toString(),
        method: method.toString(),
        version: version.toString()
    };
}

// @ts-ignore
export function readerFromRequest(conn: TCPConn, buf: DynamicBuffer, request: HttpRequest): BodyReader {
    // TODO: Parse request body
}

// @ts-ignore
export async function handleRequest(msg: HttpRequest, body: BodyReader): Promise<HttpResponse> {
    // TODO: Generate response
}
