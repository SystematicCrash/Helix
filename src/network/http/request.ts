import DynamicBuffer from "../mem/DynamicBuffer";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import Delimiter from "../common/constants";
import {splitBuffer, stripBuffer} from "../mem/bytes";
import {parseHeaders} from "./header";
import {HttpHeader, HttpMethod, SUPPORTED_VERSIONS, VALID_METHODS} from "./constants";
import HttpError from "./HttpError";
import TCPConnection from "../tcp/conn/TCPConnection.js";

type BufferGenerator = AsyncGenerator<Buffer, void, void>;
// count to 99
async function *countSheep(): BufferGenerator {
    for (let i = 0; i < 100; i++) {
// sleep 1s, then output the counter
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield Buffer.from(`${i}\n`);
    }
}

function readerFromGenerator(gen: BufferGenerator): BodyReader {
    return {
        length: -1,
        read: async (): Promise<Buffer> => {
            const r = await gen.next();
            if (r.done) {
                return Buffer.from(''); // EOF
            } else {
                console.assert(r.value.length > 0);
                return r.value;
            }
        },
    };
}

/**
 * TODO: This is just a toy and should be changed in the real product
 * Dispatches the request to the appropriate handler and returns an HTTP response.
 **/
export async function handleRequest(request: HttpRequest, body: BodyReader): Promise<HttpResponse> {
    let payload: BodyReader;

    switch (request.url) {
        case '/echo':
            payload = body;
            break;
        case '/sheep':
            payload = readerFromGenerator(countSheep());
            break;
        default:
            payload = memoryReader(Buffer.from('Hello world!'));
            break;
    }

    return {
        code: 200,
        version: request.version.toString(),
        headers: new Map([['Server', 'Helix WebServer']]),
        body: payload,
    }
}

/** Parses a raw HTTP request buffer into an HttpRequest, validating method and version. */
export function parseRequest(data: Buffer): HttpRequest {
    data = stripBuffer(data, Delimiter.CRLF);

    const lines = splitBuffer(data, Delimiter.CRLF);
    const [method, url, version] = splitBuffer(lines[0], Delimiter.SP);
    const headers = parseHeaders(lines.slice(1, lines.length));

    if (!VALID_METHODS.has(method.toString()))
        throw new HttpError(405, 'Method not allowed');
    if (!SUPPORTED_VERSIONS.includes(version.toString()))
        throw new HttpError(501, 'Http version not supported. supported version: 1.1');

    return {
        headers,
        url: url.toString('latin1'),
        method: method.toString(),
        version: version.toString()
    };
}

/** Selects the appropriate BodyReader based on Content-Length, Transfer-Encoding, or EOF. */
export function getReader(conn: TCPConnection, buf: DynamicBuffer, request: HttpRequest): BodyReader {
    const bodyAllowed = isBodyAllowed(request);
    const bodyLen = getBodyLength(request);
    const chunked = getTransferEncoding(request) === 'chunked';

    if (bodyLen > 0 && chunked)
        throw new HttpError(400, 'Bad Request');
    if (!bodyAllowed && (bodyLen > 0 || chunked))
        throw new HttpError(400, 'Http body not allowed');

    if(bodyLen) return fixedReader(conn, buf, bodyLen);
    else if (chunked) return chunkedReader(conn, buf);
    else return untilEOFReader(conn, buf);
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
function getTransferEncoding(request: HttpRequest): string|null {
    const transferEn = request.headers.get(HttpHeader.TransferEncoding);
    return transferEn ? transferEn : null;
}

/** Returns false for methods that must not carry a body (GET, HEAD). */
function isBodyAllowed(request: HttpRequest): boolean {
    return request.method !== HttpMethod.GET && request.method !== HttpMethod.HEAD;
}

/** Reads exactly `remain` bytes from the connection, consuming from the buffer first. */
function fixedReader(conn: TCPConnection, buf: DynamicBuffer, remain: number): BodyReader {
    return {
        length: remain,
        read: async (): Promise<Buffer> => {
            if (remain === 0) return Buffer.from(''); // EOF

            if (buf.length === 0) {
                const data = await conn.read();
                if (data === null) {
                    throw new Error('Unexpected EOF from http body');
                }
                buf.push(data);
            }
            const consume = Math.min(buf.length, remain);
            remain -= consume;
            const data = buf.getView(consume);
            buf.clear(consume);
            return data;
        }
    }
}

/** Reads a Transfer-Encoding: chunked body. */
async function* readChunks(conn: TCPConnection, buff: DynamicBuffer): BufferGenerator {
    for (let last = false; !last; ) {
        const idx = buff.getView().indexOf('\r\n');

        if (idx < 0) {
            buff.push(await conn.read());
            continue;
        }

        let remain = parseInt(buff.getView(idx + 1).toString(), 16);
        buff.clear(idx + 2);
        last = remain === 0;

        while (remain > 0) {
            if (!buff.length) {
                buff.push(await conn.read());
            }

            const consume = Math.min(remain, buff.length);
            const data = buff.getView(consume);
            buff.clear(consume);
            remain -= consume;
            yield data;
        }
        buff.clear(2);
    }
}

/** Reads until the connection closes. Not yet implemented. */
function untilEOFReader(conn: TCPConnection, buf: DynamicBuffer): BodyReader {
    // TODO: Read the rest of connection
    throw new HttpError(501, 'Cannot read the rest of connection');
}

/** Returns a BodyReader that yields the given buffer once, then signals EOF. */
export function memoryReader(data: Buffer): BodyReader {
    let done = false;
    return {
        length: data.length,
        read: async (): Promise<Buffer> => {
            if (done) return Buffer.from(''); // EOF
            done = true;
            return data;
        }
    }
}