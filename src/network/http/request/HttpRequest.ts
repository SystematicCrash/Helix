import {splitBuffer, stripBuffer} from "../../../buffer/bytes.js";
import {CRLF} from "../../common/constants.js";
import {parseHeaders} from "./parser/parseHeaders.js";
import {parseRequestLine} from "./parser/parseRequestLine.js";
import {parseRangeHeader} from "./parser/parseRange.js";
import {HttpHeader, HttpMethod, MAX_BODY_LENGTH, TransferEncoding} from "../common/constants.js";
import HttpError from "../common/HttpError.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import TCPConnection from "../../tcp/conn/TCPConnection.js";
import {HttpBody} from "../body/HttpBody.js";
import {ByteRange} from "../../../common/types.js";
import StreamBody from "../body/StreamBody.js";
import {parseChunks} from "./parser/parseChunks.js";
import EmptyBody from "../body/EmptyBody.js";

/*
 * Parsed HTTP request head value object.
 * Holds the method, URL, version, and headers, and validates them on construction.
 * The body is deliberately not stored on this object: it can be arbitrarily large
 * or chunked, so it is streamed lazily via a HttpBody created by
 * createBodyReader() below once the head has been parsed.
 */
export default class HttpRequest {
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

    /** Parsed range if present. */
    get rangeSet(): ByteRange[] | null {
        const range = this.headers.get(HttpHeader.Range);
        return range ? parseRangeHeader(range) : null;
    }

    /** Extracts and parses the Content-Length header value, returning -1 if absent.
     * RFC 9110 §8.6: Content-Length must be a single non-negative integer of ASCII digits. */
    get contentLength(): number {
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
    get transferEncoding(): string | null {
        return this.headers.get(HttpHeader.TransferEncoding) ?? null;
    }

    /** Returns false for methods that must not carry a body (GET, HEAD). */
    get isBodyAllowed(): boolean {
        return this.method !== HttpMethod.GET && this.method !== HttpMethod.HEAD;
    }

    /**
     * Creates the lazy HttpBody that streams this request's body.
     * Selects the concrete reader based on Content-Length, Transfer-Encoding,
     * or connection-close framing, validating the head-to-body contract first.
     */
    public getBody(conn: TCPConnection, buf: DynamicBuffer): HttpBody {
        const bodyLen = this.contentLength;
        const chunked = this.transferEncoding === TransferEncoding.CHUNKED;

        if (bodyLen > 0 && chunked)
            throw new HttpError(400, 'Bad Request');
        if (!this.isBodyAllowed && (bodyLen > 0 || chunked))
            throw new HttpError(400, 'Http body not allowed');

        if (bodyLen > 0) return new StreamBody(conn.stream(), bodyLen);
        else if (chunked) return new StreamBody(parseChunks(conn.stream(), buf));
        else return new EmptyBody();
    }

    /**
     * Parses a raw HTTP request buffer into this request, validating method and version.
     */
    private parse(data: Buffer): void {
        data = stripBuffer(data, CRLF);
        const lines = splitBuffer(data, CRLF);

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
}
