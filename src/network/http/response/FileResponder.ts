import { HttpHeader, HttpMethod } from "../common/constants.js";
import HttpResponse from "./HttpResponse.js";
import HttpRequest from "../request/HttpRequest.js";
import StreamBody from "../body/StreamBody.js";
import { openSandboxedFile } from "../../../fs/index.js";
import FileHandle from "../../../fs/file/FileHandle.js";
import FileStats from "../../../fs/file/FileStats.js";
import CacheValidator from "../cache/CacheValidator.js";
import { rangeToIOOptions } from "../../../fs/common/utils.js";
import HttpError from "../common/HttpError.js";

/**
 * Translates filesystem access into an HTTP response: cache validation
 * (delegated to CacheValidator), HEAD vs GET vs OPTIONS negotiation, byte-range
 * streaming, and `FileHandle` cleanup across every outcome (200, 206, 304, errors).
 */
export default class FileResponder {
    /** Serves `filepath` (relative to the document root) as a static file for `request`. */
    public static async respond(request: HttpRequest, filepath: string): Promise<HttpResponse> {
        const handle = await openSandboxedFile(filepath);
        const stats = await handle.getStats();
        return FileResponder.buildResponse(request, handle, stats);
    }

    /** Dispatches HEAD/OPTIONS/GET to the right response builder and owns the file-handle cleanup. */
    private static async buildResponse(request: HttpRequest, handle: FileHandle, stats: FileStats): Promise<HttpResponse> {
        if (request.method === HttpMethod.HEAD || request.method === HttpMethod.OPTIONS) {
            try {
                return FileResponder.describeFile(request, stats);
            } finally {
                await handle.close();
            }
        }

        const metadata = { mtimeMs: stats.mtimeMs, size: stats.size };

        if (CacheValidator.isNotModified(request, metadata)) {
            try {
                return FileResponder.notModified(stats);
            } finally {
                await handle.close();
            }
        }

        const rangeSet = request.rangeSet;
        const canServeRange =
            rangeSet
            && rangeSet.length > 0
            && CacheValidator.ifRangeMatches(request, metadata)

        if (canServeRange) {
            const opts = rangeToIOOptions(rangeSet[0]!, stats.size);
            if (!opts || opts.position === null || opts.position === undefined || opts.length === undefined) {
                await handle.close();
                throw HttpError.rangeNotSatisfiable(stats.size);
            }

            const start = opts.position;
            const length = opts.length;
            const end = start + length - 1;
            const contentRange = `bytes ${start}-${end}/${stats.size}`;

            return FileResponder.partialContent(handle, stats, contentRange, start, length);
        }

        return FileResponder.fullContent(handle, stats);
    }

    /** HEAD and OPTIONS share the "describe the resource without a body" contract. */
    private static describeFile(
        request: HttpRequest,
        stats: FileStats,
        contentRange: string | null = null,
        ranged = false,
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
        const stream = handle.streamAndClose();
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
        const stream = handle.streamAndClose(undefined, rangeStart);
        const body = new StreamBody(stream, rangeLength);
        const response = new HttpResponse(206, body);
        FileResponder.applyFraming(response, rangeLength, contentRange, true);
        FileResponder.applyValidator(response, stats);
        return response;
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
        response.setHeader(HttpHeader.Allow, [HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS].join(", "));
        response.setHeader(HttpHeader.AcceptRange, "bytes");
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
        response.setHeader(HttpHeader.AcceptRange, "bytes");
        if (ranged && contentRange !== null) {
            response.setHeader(HttpHeader.ContentRange, contentRange);
        }
    }

    /** Sets ETag and Last-Modified from file stats. */
    private static applyValidator(response: HttpResponse, stats: FileStats): void {
        const etag = CacheValidator.makeEtag({ mtimeMs: stats.mtimeMs, size: stats.size });
        response.setHeader(HttpHeader.ETag, CacheValidator.formatEtag(etag));
        response.setHeader(HttpHeader.LastModified, new Date(stats.mtimeMs).toUTCString());
    }
}