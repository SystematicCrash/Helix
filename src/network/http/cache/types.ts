export interface CacheMetadata {
    /** Modification time in milliseconds since Unix epoch (e.g. stats.mtimeMs). */
    mtimeMs: number;
    /** Resource size in bytes (e.g. stats.size). */
    size: number;
}
