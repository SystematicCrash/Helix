import {splitBuffer, stripBuffer} from "../../mem/bytes.js";
import Delimiter from "../../common/constants.js";
import {parseHeaders} from "../common/headers/parseHeaders.js";
import {HttpHeader, HttpMethod, SUPPORTED_VERSIONS, VALID_METHODS} from "../common/constants.js";
import HttpError from "../common/HttpError.js";
import {HttpRequest as HttpRequestType} from "../common/types.js";

/*
 * Parsed HTTP request value object.
 * Holds the method, URL, version, and headers, and validates them on construction.
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

    /** Parses a raw HTTP request buffer into this request, validating method and version. */
    private parse(data: Buffer): void {
        data = stripBuffer(data, Delimiter.CRLF);
        const lines = splitBuffer(data, Delimiter.CRLF);

        if (!lines.length) throw new HttpError(400, "lines cannot be empty");

        const firstLine = lines[0];
        if (!firstLine) throw new HttpError(400, "empty request line");

        const [method, url, version] = splitBuffer(firstLine, Delimiter.SP);
        if (!method || !url || !version)
            throw new HttpError(400, 'Malformed request line');

        const headers = parseHeaders(lines.slice(1, lines.length));

        if (!VALID_METHODS.has(method.toString()))
            throw new HttpError(405, 'Method not allowed');
        if (!SUPPORTED_VERSIONS.includes(version.toString()))
            throw new HttpError(501, 'Http version not supported. supported version: 1.1');

        this.headers = headers;
        this.url = url.toString('latin1');
        this.method = method.toString();
        this.version = version.toString();
    }
}
