import HttpRequest from "../request/HttpRequest.js";
import {HttpHeader} from "../common/constants.js";
import {CacheMetadata} from "./types.js";

/**
 * Handles HTTP conditional request evaluation (ETag and Last-Modified / If-None-Match and If-Modified-Since).
 * Complies with RFC 9110 §13:
 * - If-None-Match takes precedence over If-Modified-Since.
 * - If-Modified-Since is ignored if If-None-Match is present.
 * - HTTP date comparisons use 1-second resolution.
 */
export default class CacheValidator {
    /**
     * Computes a strong ETag string from timestamp and size.
     * Returns an unquoted hex representation: e.g. "1923e4f-2a4b"
     */
    public static makeEtag(metadata: CacheMetadata): string {
        return `${metadata.mtimeMs.toString(16)}-${metadata.size.toString(16)}`;
    }

    /**
     * Formats an ETag suitable for an HTTP response header, enclosed in double quotes.
     * Weak tags are prepended with `W/`.
     */
    public static formatEtag(etag: string, weak = false): string {
        const clean = etag.replace(/^W\//, "").replace(/^"|"$/g, "");
        return weak ? `W/"${clean}"` : `"${clean}"`;
    }

    /**
     * Evaluates conditional headers for GET / HEAD requests.
     * Returns true if the client's cache is valid and a `304 Not Modified` should be sent.
     */
    public static isNotModified(request: HttpRequest, metadata: CacheMetadata): boolean {
        const currentEtag = CacheValidator.makeEtag(metadata);
        const ifNoneMatch = request.headers.get(HttpHeader.IfNoneMatch);

        if (ifNoneMatch !== undefined) {
            return CacheValidator.etagMatches(ifNoneMatch, currentEtag);
        }
        // TODO: Extract this section into separate method called `timestampMatches`.
        const ifModifiedSince = request.headers.get(HttpHeader.IfModifiedSince);
        if (ifModifiedSince !== undefined) {
            const clientDate = new Date(ifModifiedSince);
            if (Number.isNaN(clientDate.getTime())) {
                return false;
            }

            const serverSec = Math.floor(metadata.mtimeMs / 1000);
            const clientSec = Math.floor(clientDate.getTime() / 1000);

            return serverSec <= clientSec;
        }

        return false;
    }

    /**
     * Checks if `targetEtag` satisfies the condition set by `headerValue`.
     * Supports comma-separated lists, weak tags (W/), unquoted tags, and wildcard `*`.
     */
    public static etagMatches(headerValue: string, targetEtag: string): boolean {
        const cleanTarget = targetEtag.replace(/^W\//, "").replace(/^"|"$/g, "");
        const tokens = headerValue.split(",");

        for (const rawToken of tokens) {
            let token = rawToken.trim();
            if (token === "*") {
                return true;
            }

            if (token.startsWith("W/")) {
                token = token.slice(2);
            }

            if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
                token = token.slice(1, -1);
            }

            if (token === cleanTarget) {
                return true;
            }
        }

        return false;
    }
}