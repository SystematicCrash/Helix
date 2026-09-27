import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import FileResponder from '../../../src/fs/server/FileResponder.js';
import FileHandle from '../../../src/fs/file/FileHandle.js';
import HttpRequest from '../../../src/network/http/request/HttpRequest.js';
import StreamBody from '../../../src/network/http/body/StreamBody.js';
import EmptyBody from '../../../src/network/http/body/EmptyBody.js';
import { HttpBody } from '../../../src/network/http/body/HttpBody.js';
import { HttpHeader, HttpMethod } from '../../../src/network/http/common/constants.js';

let root: string;
let publicDir: string;
let originalCwd: string;

beforeAll(async () => {
    originalCwd = process.cwd();
    root = await mkdtemp(join(tmpdir(), 'helix-responder-'));
    publicDir = join(root, 'public');
    await mkdir(publicDir, {recursive: true});
    await writeFile(join(publicDir, 'hello.txt'), 'file content');
    await writeFile(join(publicDir, 'range.txt'), '0123456789');
    process.chdir(root); // DOCUMENT_ROOT is relative to cwd
});

afterAll(async () => {
    process.chdir(originalCwd);
    await rm(root, {recursive: true, force: true});
});

let closeSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    closeSpy = vi.spyOn(FileHandle.prototype, 'close');
});
afterEach(() => {
    closeSpy.mockRestore();
});

/** Builds a well-formed request head (Host is mandatory). */
function httpRequest(method: string, headers: Record<string, string> = {}): HttpRequest {
    const lines = [`${method} /hello.txt HTTP/1.1`, 'Host: localhost'];
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    return HttpRequest.from(Buffer.from(lines.join('\r\n') + '\r\n\r\n'));
}

/** Drains a body to EOF, exercising the stream's cleanup path. */
async function drain(body: HttpBody): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for (;;) {
        const chunk = await body.read();
        if (chunk === null) break;
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/** Recomputes the validator headers FileResponder derives from stat, to assert against. */
async function fileMeta(rel: string) {
    const st = await stat(join(publicDir, rel));
    return {
        size: st.size,
        mtimeMs: st.mtimeMs,
        etag: `"${st.mtimeMs.toString(16)}-${st.size.toString(16)}"`,
        lastModified: new Date(st.mtimeMs).toUTCString(),
    };
}

describe('FileResponder.respond() — GET', () => {
    test('streams the full file as a 200 StreamBody with framing and validator headers', async () => {
        const meta = await fileMeta('hello.txt');
        const response = await FileResponder.respond(httpRequest(HttpMethod.GET), '/hello.txt');

        expect(response.code).toBe(200);
        expect(response.body).toBeInstanceOf(StreamBody);
        expect(response.getHeader(HttpHeader.ContentLength)).toBe(String(meta.size));
        expect(response.getHeader(HttpHeader.AcceptRange)).toBe('bytes');
        expect(response.getHeader(HttpHeader.ETag)).toBe(meta.etag);
        expect(response.getHeader(HttpHeader.LastModified)).toBe(meta.lastModified);
        expect(response.hasHeader(HttpHeader.ContentRange)).toBe(false);

        expect(await drain(response.body)).toEqual(Buffer.from('file content'));
        expect(closeSpy).toHaveBeenCalledTimes(1); // the stream's finally closed the handle
    });

    test('serves a byte range as a 206 StreamBody with Content-Range', async () => {
        const meta = await fileMeta('range.txt');
        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.Range]: 'bytes=2-5'}),
            '/range.txt',
        );

        expect(response.code).toBe(206);
        expect(response.body).toBeInstanceOf(StreamBody);
        expect(response.getHeader(HttpHeader.ContentLength)).toBe('4');
        expect(response.getHeader(HttpHeader.ContentRange)).toBe('bytes 2-5/10');
        expect(response.getHeader(HttpHeader.AcceptRange)).toBe('bytes');
        expect(response.getHeader(HttpHeader.ETag)).toBe(meta.etag);

        expect(await drain(response.body)).toEqual(Buffer.from('2345'));
        expect(closeSpy).toHaveBeenCalledTimes(1);
    });
});

describe('FileResponder.respond() — HEAD', () => {
    test('returns 200 with an EmptyBody, framing and validator headers, without reading the file', async () => {
        const meta = await fileMeta('hello.txt');
        const response = await FileResponder.respond(httpRequest(HttpMethod.HEAD), '/hello.txt');

        expect(response.code).toBe(200);
        expect(response.body).toBeInstanceOf(EmptyBody);
        expect(response.getHeader(HttpHeader.ContentLength)).toBe(String(meta.size));
        expect(response.getHeader(HttpHeader.AcceptRange)).toBe('bytes');
        expect(response.getHeader(HttpHeader.ETag)).toBe(meta.etag);
        expect(response.getHeader(HttpHeader.LastModified)).toBe(meta.lastModified);

        expect(await drain(response.body)).toEqual(Buffer.alloc(0));
        expect(closeSpy).toHaveBeenCalledTimes(1); // closed up-front, no data read
    });
});

describe('FileResponder.respond() — cache validation', () => {
    test('returns 304 with EmptyBody when If-None-Match matches the ETag', async () => {
        const meta = await fileMeta('hello.txt');
        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.IfNoneMatch]: meta.etag}),
            '/hello.txt',
        );

        expect(response.code).toBe(304);
        expect(response.body).toBeInstanceOf(EmptyBody);
        expect(response.getHeader(HttpHeader.ETag)).toBe(meta.etag);
        expect(response.getHeader(HttpHeader.LastModified)).toBe(meta.lastModified);
        expect(closeSpy).toHaveBeenCalledTimes(1); // closed up-front
    });

    test('returns 304 for a weak-ETag (W/) form in If-None-Match', async () => {
        const meta = await fileMeta('hello.txt');
        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.IfNoneMatch]: `W/${meta.etag}`}),
            '/hello.txt',
        );

        expect(response.code).toBe(304);
    });

    test('returns 304 when If-Modified-Since equals the mtime (1-second granularity)', async () => {
        const meta = await fileMeta('hello.txt');
        const mtimeSec = Math.floor(meta.mtimeMs / 1000);

        const equal = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.IfModifiedSince]: meta.lastModified}),
            '/hello.txt',
        );
        const oneSecondNewer = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.IfModifiedSince]: new Date((mtimeSec + 1) * 1000).toUTCString()}),
            '/hello.txt',
        );
        expect(equal.code).toBe(304);
        expect(oneSecondNewer.code).toBe(304);
    });

    test('returns 200 when If-Modified-Since is one second older than the mtime', async () => {
        const meta = await fileMeta('hello.txt');
        const mtimeSec = Math.floor(meta.mtimeMs / 1000);
        const older = new Date((mtimeSec - 1) * 1000).toUTCString();

        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {[HttpHeader.IfModifiedSince]: older}),
            '/hello.txt',
        );
        expect(response.code).toBe(200);
    });

    test('honors RFC 9110 precedence: an If-None-Match mismatch forces 200 even when If-Modified-Since matches', async () => {
        const meta = await fileMeta('hello.txt');
        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {
                [HttpHeader.IfNoneMatch]: '"deadbeef"',
                [HttpHeader.IfModifiedSince]: meta.lastModified,
            }),
            '/hello.txt',
        );
        expect(response.code).toBe(200);
    });

    test('ignores If-Modified-Since entirely when If-None-Match is present', async () => {
        // A stale If-Modified-Since (one second older) would force a 200 on its own,
        // but a matching If-None-Match must win with a 304 — proving IMS is not consulted.
        const meta = await fileMeta('hello.txt');
        const mtimeSec = Math.floor(meta.mtimeMs / 1000);
        const stale = new Date((mtimeSec - 1) * 1000).toUTCString();

        const response = await FileResponder.respond(
            httpRequest(HttpMethod.GET, {
                [HttpHeader.IfNoneMatch]: meta.etag,
                [HttpHeader.IfModifiedSince]: stale,
            }),
            '/hello.txt',
        );
        expect(response.code).toBe(304);
    });
});

describe('FileResponder.respond() — OPTIONS', () => {
    test('returns 204 with Allow and Accept-Range', async () => {
        const response = await FileResponder.respond(httpRequest(HttpMethod.OPTIONS), '/hello.txt');

        expect(response.code).toBe(204);
        expect(response.getHeader(HttpHeader.Allow)).toBe([HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].join(', '));
        expect(response.getHeader(HttpHeader.AcceptRange)).toBe('bytes');
        expect(closeSpy).toHaveBeenCalledTimes(1);
    });
});
