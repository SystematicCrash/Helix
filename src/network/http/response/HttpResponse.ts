import EmptyBody from '../body/EmptyBody.js';
import MemoryBody from '../body/MemoryBody.js';
import { HttpBody } from '../body/HttpBody.js';
import { HTTP_STATUS, HttpVersion } from '../common/constants.js';

export default class HttpResponse {
    public code: number;
    public body: HttpBody;
    public version: string;
    public headers: Map<string, string> = new Map();

    constructor(code: number, body: HttpBody, version: string = HttpVersion.HTTP_1_1) {
        this.validateCode(code);
        this.validateVersion(version);

        this.code = code;
        this.body = body;
        this.version = version;
    }

    static from(code: number, body: HttpBody): HttpResponse {
        return new HttpResponse(code, body);
    }

    static html(code: number, content: string | Buffer): HttpResponse {
        const response = new HttpResponse(code, new MemoryBody(
            Buffer.isBuffer(content) ? content : Buffer.from(content),
        ));
        response.headers.set('content-type', 'text/html; charset=utf-8');
        return response;
    }

    static json(code: number, value: unknown): HttpResponse {
        const response = new HttpResponse(code, new MemoryBody(Buffer.from(JSON.stringify(value))));
        response.headers.set('content-type', 'application/json');
        return response;
    }

    static empty(code: number): HttpResponse {
        return new HttpResponse(code, new EmptyBody());
    }

    static redirect(code: number, location: string): HttpResponse {
        const response = HttpResponse.html(code, `<a href="${location}">Redirecting...</a>`);
        response.headers.set('location', location);
        return response;
    }

    get statusText(): string {
        return HTTP_STATUS[this.code] ?? 'Unknown';
    }

    get contentLength(): number | null {
        return this.body.length === -1 ? null : this.body.length;
    }

    setHeader(name: string, value: string): this {
        this.headers.set(name, value);
        return this;
    }

    hasHeader(name: string): boolean {
        return this.headers.has(name);
    }

    getHeader(name: string): string | undefined {
        return this.headers.get(name);
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
        return this;
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
}
