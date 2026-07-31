import {BodyReader, HttpResponse} from "./types";
import TCPConnection from "../tcp/conn/TCPConnection.js";
import HttpError from "./HttpError";
import {HTTP_STATUS, HttpHeader, HttpVersion, SUPPORTED_VERSIONS, TransferEncoding} from "./constants";
import {memoryReader} from "./request";
import Delimiter from "../common/constants.js";


/** Writes the response headers and streams the body to the connection. */
export async function writeResponse(conn: TCPConnection, response: HttpResponse): Promise<void> {
    if (response.body.length < 0) {
        response.headers.set(HttpHeader.TransferEncoding, TransferEncoding.CHUNKED);
    } else {
        response.headers.set(HttpHeader.ContentLength, response.body.length.toString());
    }
    await conn.write(encodeHeaders(response));

    if (response.headers.get(HttpHeader.TransferEncoding) === TransferEncoding.CHUNKED) {
        await chunkedWriter(conn, response.body);
    } else {
        await fixedWriter(conn, response.body)
    }

}

/** Converts any thrown error into an HttpResponse with an appropriate status code. */
export function mapErrorToResponse(error: unknown): HttpResponse {
    let code: number;
    let body: BodyReader;

    if (error instanceof HttpError) {
        code = error.status;
        body = memoryReader(Buffer.from(error.message));
    } else if (error instanceof Error) {
        code = 500;
        body = memoryReader(Buffer.from(error.message));
    } else {
        code = 500;
        body = memoryReader(Buffer.from("Webserver Internal Error"));
    }

    return {
        code,
        body,
        version: HttpVersion.HTTP_1_1,
        headers: new Map(),
    };
}

/** Serializes the response status line and headers into a buffer. */
function encodeHeaders(response: HttpResponse): Buffer {
    const parts: string[] = [];
    parts.push(`${response.version} ${response.code} ${HTTP_STATUS[response.code]}`);

    for (const header of response.headers) {
        parts.push(`${header[0]}: ${header[1]}`);
    }

    parts.push('\r\n');
    return Buffer.from(parts.join("\r\n"));
}

async function fixedWriter(conn: TCPConnection, body: BodyReader): Promise<void> {
    while (true) {
        const data = await body.read();
        if (data.length === 0) break;
        await conn.write(data);
    }
}

async function chunkedWriter(conn: TCPConnection, body: BodyReader): Promise<void> {
    while (true) {
        const data = await body.read();
        if (data.length === 0) break;

        const chunk = Buffer.from(
            data.length.toString(16) +
            Delimiter.CRLF +
            data +
            Delimiter.CRLF
        );

        await conn.write(chunk);
    }
}
