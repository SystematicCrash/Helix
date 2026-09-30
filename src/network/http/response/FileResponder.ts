import {HttpHeader, HttpMethod} from "../common/constants.js";
import HttpResponse from "./HttpResponse.js";
import HttpRequest from "../request/HttpRequest.js";
import StreamBody from "../body/StreamBody.js";
import {serveStaticFile, streamWithCleanup} from "../../../fs/server/serveFile.js";
import type {ServedFile} from "../../../fs/server/serveFile.js";
import FileHandle from "../../../fs/file/FileHandle.js";
import FileStats from "../../../fs/file/FileStats.js";

/**
 * Translates filesystem access into an HTTP response: cache validation
 * (ETag / If-Modified-Since), HEAD vs GET vs OPTIONS negotiation, byte-range
 * streaming, and `FileHandle` cleanup across every outcome (200, 206, 304, errors).
 */
export default class FileResponder {
    /** Serves `filepath` (relative to the document root) as a static file for `request`. */
    public static async respond(request: HttpRequest, filepath: string): Promise<HttpResponse> {
        const rangeSet = request.rangeSet ?? [];
        const served = await serveStaticFile(filepath, rangeSet);
        return FileResponder.buildResponse(request, served);
    }

    /** Dispatches HEAD/OPTIONS/GET to the right response builder and owns the file-handle cleanup. */
    private static async buildResponse(request: HttpRequest, served: ServedFile): Promise<HttpResponse> {
        const {handle, stats, contentRange, ranged} = served;

        // HEAD and OPTIONS never read the file body, so the handle closes up-front.
        if (request.method === HttpMethod.HEAD || request.method === HttpMethod.OPTIONS) {
            try {
                return FileResponder.describeFile(request, stats, contentRange, ranged);
            } finally {
                await handle.close();
            }
        }

        // GET: not-modified closes up-front; a 200/206 streams and the
        // generator's finally owns the close, so we return without closing here.
        if (await FileResponder.isNotModified(request, stats)) {
            try {
                return FileResponder.notModified(stats);
            } finally {
                await handle.close();
            }
        }

        if (ranged) {
            return FileResponder.partialContent(handle, stats, contentRange!, served.rangeStart, served.rangeLength);
        }
        return FileResponder.fullContent(handle, stats);
    }

    /** HEAD and OPTIONS share the "describe the resource without a body" contract. */
    private static describeFile(
        request: HttpRequest,
        stats: FileStats,
        contentRange: string | null,
        ranged: boolean,
    ): HttpResponse {
        if (request.method === HttpMethod.OPTIONS) {
            return FileResponder.optionsAllowed();
        }
        const response = HttpResponse.empty(200);
        FileResponder.applyFraming(response, stats.size, contentRange, ranged);
        FileResponder.applyValidator(response, stats);
        return response;
    }

    /** Builds a 200 OK response that streams the entire file. */
    private static fullContent(handle: FileHandle, stats: FileStats): HttpResponse {
        const stream = streamWithCleanup(handle);
        const body = new StreamBody(stream, stats.size);
        const response = new HttpResponse(200, body);
        FileResponder.applyFraming(response, stats.size, null, false);
        FileResponder.applyValidator(response, stats);
        return response;
    }

    /** Builds a 206 Partial Content response over the requested byte slice. */
    private static partialContent(
        handle: FileHandle,
        stats: FileStats,
        contentRange: string,
        rangeStart: number,
        rangeLength: number,
    ): HttpResponse {
        const stream = streamWithCleanup(handle, rangeStart, rangeLength);
        const body = new StreamBody(stream, rangeLength);
        const response = new HttpResponse(206, body);
        FileResponder.applyFraming(response, rangeLength, contentRange, true);
        FileResponder.applyValidator(response, stats);
        return response;
    }

    /** RFC 9110 §13.1.2/13.1.3: If-None-Match wins; If-Modified-Since is ignored when it is present. */
    private static async isNotModified(request: HttpRequest, stats: FileStats): Promise<boolean> {
        const etag = FileResponder.makeEtag(stats);
        const ifNoneMatch = request.headers.get(HttpHeader.IfNoneMatch);
        if (ifNoneMatch !== undefined) {
            return FileResponder.etagMatches(ifNoneMatch, etag);
        }

        const ifModifiedSince = request.headers.get(HttpHeader.IfModifiedSince);
        if (ifModifiedSince !== undefined) {
            const clientDate = new Date(ifModifiedSince);
            if (Number.isNaN(clientDate.getTime())) return false;
            return Math.floor(stats.mtimeMs / 1000) <= Math.floor(clientDate.getTime() / 1000);
        }

        return false;
    }

    /** Builds a 304 Not Modified response carrying validator headers. */
    private static notModified(stats: FileStats): HttpResponse {
        const response = HttpResponse.empty(304);
        FileResponder.applyValidator(response, stats);
        return response;
    }

    /** Builds a 204 response advertising GET, HEAD, OPTIONS, and byte ranges. */
    private static optionsAllowed(): HttpResponse {
        const response = HttpResponse.empty(204);
        response.setHeader(HttpHeader.Allow, [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].join(', '));
        response.setHeader(HttpHeader.AcceptRange, 'bytes');
        return response;
    }

    /** Sets Content-Length, Accept-Range, and Content-Range on the response. */
    private static applyFraming(
        response: HttpResponse,
        length: number,
        contentRange: string | null,
        ranged: boolean,
    ): void {
        response.setHeader(HttpHeader.ContentLength, length.toString());
        response.setHeader(HttpHeader.AcceptRange, 'bytes');
        if (ranged && contentRange !== null) {
            response.setHeader(HttpHeader.ContentRange, contentRange);
        }
    }

    /** Sets ETag and Last-Modified from file stats. */
    private static applyValidator(response: HttpResponse, stats: FileStats): void {
        response.setHeader(HttpHeader.ETag, `"${FileResponder.makeEtag(stats)}"`);
        response.setHeader(HttpHeader.LastModified, new Date(stats.mtimeMs).toUTCString());
    }

    /** Computes a strong ETag from the file's mtime and size. */
    private static makeEtag(stats: FileStats): string {
        return `${stats.mtimeMs.toString(16)}-${stats.size.toString(16)}`;
    }

    /**
     * True when the response entity tag is among the request's etag-list. Tolerant of a
     * leading weak-validator (`W/`) and surrounding quotes, and honors the `*` entity-tag
     * (RFC 9110 §13.1.2).
     */
    private static etagMatches(headerValue: string, etag: string): boolean {
        for (const raw of headerValue.split(',')) {
            let token = raw.trim();
            if (token === '*') return true;
            if (token.startsWith('W/')) token = token.slice(2);
            if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) token = token.slice(1, -1);
            if (token === etag) return true;
        }
        return false;
    }
}
