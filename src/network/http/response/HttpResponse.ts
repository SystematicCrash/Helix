import EmptyBody from '../body/EmptyBody.js';
import MemoryBody from '../body/MemoryBody.js';
import StreamBody from '../body/StreamBody.js';
import { HttpBody } from '../body/HttpBody.js';
import { ContentType, HTTP_STATUS, HttpHeader, HttpVersion, TransferEncoding } from '../common/constants.js';
import type { StaticFileStream } from '../common/types.js';

export default class HttpResponse {
    private _shouldClose: boolean = false;
    private readonly _headers: Map<string, string> = new Map();

    constructor(
        public code: number,
        public body: HttpBody,
        public version: string = HttpVersion.HTTP_1_1,
        initialHeaders?: Record<string, string> | Map<string, string>,
    ) {
        this.validateCode(code);
        this.validateVersion(version);

        this.code = code;
        this.body = body;
        this.version = version;

        if (initialHeaders) {
            const entries = initialHeaders instanceof Map ? initialHeaders.entries() : Object.entries(initialHeaders);
            for (const [key, value] of entries) {
                this._headers.set(key.toLowerCase(), value);
            }
        }

        this.applyDefaultFraming();
    }

    static from(code: number, body: HttpBody): HttpResponse {
        return new HttpResponse(code, body);
    }

    static html(code: number, content: string | Buffer): HttpResponse {
        const body = new MemoryBody(content);
        return new HttpResponse(code, body, HttpVersion.HTTP_1_1, {
            [HttpHeader.ContentType]: ContentType.TextHtmlUtf8,
        });
    }

    static json(code: number, value: unknown): HttpResponse {
        const body = new MemoryBody(Buffer.from(JSON.stringify(value)));
        return new HttpResponse(code, body, HttpVersion.HTTP_1_1, {
            [HttpHeader.ContentType]: ContentType.Json,
        });
    }

    static text(code: number, text: string): HttpResponse {
        const body = new MemoryBody(Buffer.from(text));
        return new HttpResponse(code, body, HttpVersion.HTTP_1_1, {
            [HttpHeader.ContentType]: ContentType.TextPlainUtf8,
        });
    }

    static empty(code: number): HttpResponse {
        return new HttpResponse(code, new EmptyBody());
    }

    static redirect(code: number, location: string): HttpResponse {
        const body = new MemoryBody(`<a href="${location}">Redirecting...</a>`);
        return new HttpResponse(code, body, HttpVersion.HTTP_1_1, {
            [HttpHeader.ContentType]: ContentType.TextHtmlUtf8,
            [HttpHeader.Location]: location,
        });
    }

    static file(result: StaticFileStream): HttpResponse {
        const response = new HttpResponse(result.status, new StreamBody(result.stream, result.size));
        response.addFileHeaders(result);
        return response;
    }

    static headFile(result: StaticFileStream): HttpResponse {
        const response = new HttpResponse(result.status, new EmptyBody());
        response.addFileHeaders(result);
        return response;
    }

    get headers(): ReadonlyMap<string, string> {
        return this._headers;
    }

    get statusText(): string {
        return HTTP_STATUS[this.code] ?? 'Unknown';
    }

    get contentLength(): number | null {
        return this.body.length === -1 ? null : this.body.length;
    }

    getHeader(name: string): string | undefined {
        return this._headers.get(name.toLowerCase());
    }

    hasHeader(name: string): boolean {
        return this._headers.has(name.toLowerCase());
    }

    setHeader(name: string, value: string): this {
        this._headers.set(name.toLowerCase(), value);
        return this;
    }

    setCode(code: number): this {
        this.validateCode(code);
        this.code = code;
        return this;
    }

    setVersion(version: string): this {
        this.validateVersion(version);
        this.version = version;
        return this;
    }

    setBody(body: HttpBody): this {
        this.body = body;
        this.applyDefaultFraming();
        return this;
    }

    public markAsLast(): HttpResponse {
        this._shouldClose = true;
        this._headers.set(HttpHeader.Connection, 'close');
        return this;
    }

    private applyDefaultFraming(): void {
        if (!this.hasHeader(HttpHeader.ContentLength) && !this.hasHeader(HttpHeader.TransferEncoding)) {
            if (this.body.length !== -1) {
                this._headers.set(HttpHeader.ContentLength, this.body.length.toString());
            } else {
                this._headers.set(HttpHeader.TransferEncoding, TransferEncoding.CHUNKED);
            }
        }
    }

    private validateCode(code: number): void {
        if (code < 100 || code > 599) {
            throw new RangeError(`Invalid HTTP status code: ${code}`);
        }
    }

    private validateVersion(version: string): void {
        if (version.length === 0) {
            throw new RangeError('HTTP version cannot be empty');
        }
    }

    private addFileHeaders(result: StaticFileStream): void {
        this.setHeader(HttpHeader.ContentLength, result.size.toString());
        this.setHeader(HttpHeader.AcceptRange, 'bytes');
        if (result.contentRange) {
            this.setHeader(HttpHeader.ContentRange, result.contentRange);
        }
    }
}