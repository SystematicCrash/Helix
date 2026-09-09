import {splitBuffer, stripBuffer} from "../../mem/bytes.js";
import {Delimiter} from "../../common/constants.js";
import {parseHeaders} from "./parser/parseHeaders.js";
import {parseRequestLine} from "./parser/parseRequestLine.js";
import {HttpHeader, HttpMethod, MAX_BODY_LENGTH} from "../common/constants.js";
import HttpError from "../common/HttpError.js";
import {BodyReader, HttpRequest as HttpRequestType} from "../common/types.js";
import DynamicBuffer from "../../mem/DynamicBuffer.js";
import TCPConnection from "../../tcp/conn/TCPConnection.js";
import FixedBodyReader from "./body/FixedBodyReader.js";
import ChunkedBodyReader from "./body/ChunkedBodyReader.js";
import EOFBodyReader from "./body/EOFBodyReader.js";

/*
 * Parsed HTTP request head value object.
 * Holds the method, URL, version, and headers, and validates them on construction.
 * The body is deliberately not stored on this object: it can be arbitrarily large
 * or chunked, so it is streamed lazily via a BodyReader created by
 * createBodyReader() below once the head has been parsed.
 */
export default class HttpRequest implements HttpRequestType {
    public method!: string;
    public url!: string;
    public version!: string;
    public headers: Map<string, string> = new Map();

    constructor(requestData: Buffer) {
        this.parse(requestData);
    }

    /*
     * Builds a request from raw request bytes.
     */
    static from(requestData: Buffer): HttpRequest {
        return new HttpRequest(requestData);
    }

    /**
     * Creates the lazy BodyReader that streams this request's body.
     * Selects the concrete reader based on Content-Length, Transfer-Encoding,
     * or connection-close framing, validating the head-to-body contract first.
     */
    public getBodyReader(conn: TCPConnection, buf: DynamicBuffer): BodyReader {
        const bodyLen = this.getBodyLength();
        const chunked = this.getTransferEncoding() === 'chunked';

        if (bodyLen > 0 && chunked)
            throw new HttpError(400, 'Bad Request');
        if (!this.isBodyAllowed() && (bodyLen > 0 || chunked))
            throw new HttpError(400, 'Http body not allowed');

        if (bodyLen > 0) return new FixedBodyReader(conn, buf, bodyLen);
        else if (chunked) return new ChunkedBodyReader(conn, buf);
        else return new EOFBodyReader(conn, buf);
    }

    /**
     * Parses a raw HTTP request buffer into this request, validating method and version.
     */
    private parse(data: Buffer): void {
        data = stripBuffer(data, Delimiter.CRLF);
        const lines = splitBuffer(data, Delimiter.CRLF);

        if (!lines.length) throw new HttpError(400, "lines cannot be empty");

        const firstLine = lines[0];
        if (!firstLine)
            throw new HttpError(400, "empty request line");

        const {method, url, version} = parseRequestLine(firstLine);

        this.headers = parseHeaders(lines.slice(1, lines.length));
        this.url = url;
        this.method = method;
        this.version = version;
    }

    /** Extracts and parses the Content-Length header value, returning -1 if absent.
     * RFC 9110 §8.6: Content-Length must be a single non-negative integer of ASCII digits. */
    private getBodyLength(): number {
        const contentLen = this.headers.get(HttpHeader.ContentLength);
        if (!contentLen) return -1;

        if (!/^\d+$/.test(contentLen))
            throw new HttpError(400, 'Invalid Content-Length');

        const bodyLen = Number(contentLen);
        if (bodyLen > MAX_BODY_LENGTH)
            throw new HttpError(413, 'Content Too Large');
        return bodyLen;
    }

    /** Returns the Transfer-Encoding header value, or null if not present. */
    private getTransferEncoding(): string | null {
        const transferEn = this.headers.get(HttpHeader.TransferEncoding);
        return transferEn ? transferEn : null;
    }

    /** Returns false for methods that must not carry a body (GET, HEAD). */
    private isBodyAllowed(): boolean {
        return this.method !== HttpMethod.GET && this.method !== HttpMethod.HEAD;
    }
}
