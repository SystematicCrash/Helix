import { extname } from "node:path";
import {CacheDirective, CacheDirectiveType, CONTENT_HASH_REGEX, EXTENSION_CACHE_MAP} from "./constants.js";

/**
 * Resolves the cache-control directive based on file path and filename patterns.
 */
export function resolveCacheDirective(filepath: string): CacheDirectiveType {
    if (CONTENT_HASH_REGEX.test(filepath)) {
        return CacheDirective.IMMUTABLE;
    }
    const ext = extname(filepath).toLowerCase();
    return EXTENSION_CACHE_MAP[ext] ?? CacheDirective.STATIC_DEFAULT;
}