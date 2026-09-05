import {splitBuffer, stripBuffer} from "../../mem/bytes.js";
import Delimiter from "../../common/constants.js";
import {parseHeaders} from "./parser/parseHeaders.js";
import HttpError from "../common/HttpError.js";
import {HttpRequest as HttpRequestType} from "../common/types.js";
import {parseRequestLine} from "./parser/parseRequestLine.js";

/** Parsed HTTP request value object holding method, URL, version, and headers. */
export default class HttpRequest implements HttpRequestType {
    public method!: string;
    public url!: string;
    public version!: string;
    public headers: Map<string, string> = new Map();

    constructor(requestData: Buffer) {
        this.parse(requestData);
    }

    /** Builds an HttpRequest from raw request bytes. */
    static from(requestData: Buffer): HttpRequest {
        return new HttpRequest(requestData);
    }

    /** Parses raw request bytes into this request. */
    private parse(data: Buffer): void {
        data = stripBuffer(data, Delimiter.CRLF);
        const lines = splitBuffer(data, Delimiter.CRLF);

        if (!lines.length) throw new HttpError(400, "lines cannot be empty");

        const firstLine = lines[0];
        if (!firstLine) throw new HttpError(400, "empty request line");

        const {method, url, version} = parseRequestLine(firstLine);
        this.headers = parseHeaders(lines.slice(1, lines.length));
        this.url = url;
        this.method = method;
        this.version = version;
    }
}
