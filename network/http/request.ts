import DynamicBuffer from "../mem/DynamicBuffer";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import Delimiter from "../common/constants";
import {splitBuffer, stripBuffer} from "../mem/bytes";
import {parseHeaders} from "./header";
import {HttpHeader, HttpMethod, SUPPORTED_VERSIONS, VALID_METHODS} from "./constants";
import HttpError from "./HttpError";
import TCPConnection from "../tcp/TCPConnection";


export async function handleRequest(request: HttpRequest, body: BodyReader): Promise<HttpResponse> {
    let payload: BodyReader;

    switch (request.url) {
        case '/echo':
            payload = body;
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

function getTransferEncoding(request: HttpRequest): string|null {
    const transferEn = request.headers.get(HttpHeader.TransferEncoding);
    return transferEn ? transferEn : null;
}

function isBodyAllowed(request: HttpRequest): boolean {
    return request.method !== HttpMethod.GET && request.method !== HttpMethod.HEAD;
}

function fixedReader(conn: TCPConnection, buf: DynamicBuffer, remain: number): BodyReader {
    return {
        length: remain,
        read: async (): Promise<Buffer> => {
            if (remain === 0) return Buffer.from(''); // EOF

            if (buf.length === 0) {
                const data = await conn.read();
                if (data.length === 0) {
                    throw new Error('Unexpected EOF from http body');
                }
                buf.push(data);
            }
            const consume = Math.min(buf.length, remain);
            remain -= consume;
            const data = buf.cut(consume);
            buf.pop(consume);
            return data;
        }
    }
}

function chunkedReader(conn: TCPConnection, buf: DynamicBuffer): BodyReader {
    // TODO: Implement chuck read
    throw new HttpError(501, 'Chunk read is not implemented');
}

function untilEOFReader(conn: TCPConnection, buf: DynamicBuffer): BodyReader {
    // TODO: Read the rest of connection
    throw new HttpError(501, 'Cannot read the rest of connection');
}

function memoryReader(data: Buffer): BodyReader {
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