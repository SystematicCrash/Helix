import {realpath} from "node:fs/promises";
import FileHandle from "../file/FileHandle.js";
import FileStats from "../file/FileStats.js";
import {ByteRange, BufferGenerator} from "../../common/types.js";
import {assertInsideRoot, rangeToIOOptions, resolvePath} from "../common/utils.js";
import HttpError from "../../network/http/common/HttpError.js";

export interface ServedFile {
    readonly handle: FileHandle;
    readonly stats: FileStats;
    /** `bytes start-end/total` for a partial (range) response, otherwise null. */
    readonly contentRange: string | null;
    /** True when a satisfiable byte range was applied; the stream then yields only the slice. */
    readonly ranged: boolean;
    /** Byte offset the range slice begins at; 0 for a full-file response. */
    readonly rangeStart: number;
    /** Byte length of the range slice; the full file size when not ranged. */
    readonly rangeLength: number;
}

/**
 * Opens a file under the document root and resolves it for response generation.
 * On success the handle is left OPEN — the caller (FileResponder) owns it and closes
 * it either immediately (304 / HEAD) or via the streaming generator (GET). On failure
 * the handle is closed before re-throwing, so no fd leaks through an error.
 */ // TODO: this function is dealing with http details which is not correct for a function in fs layer, maybe it's better to move it somewhere else or completely delegate it's job to another component
export async function serveStaticFile(url: string, rangeSet: ByteRange[] = []): Promise<ServedFile> {
    const filePath = resolvePath(url);
    const handle = await FileHandle.open(filePath);

    try {
        const resolved = await realpath(filePath).catch(() => filePath);
        await assertInsideRoot(resolved);

        const stats = await handle.getStats();
        if (!rangeSet.length) {
            return {handle, stats, contentRange: null, ranged: false, rangeStart: 0, rangeLength: stats.size};
        }

        const opts = rangeToIOOptions(rangeSet[0]!, stats.size);
        if (!opts || opts.position === null || opts.position === undefined || opts.length === undefined) {
            await handle.close();
            throw HttpError.rangeNotSatisfiable(stats.size);
        }

        const start = opts.position;
        const end = start + opts.length - 1;
        return {
            handle,
            stats,
            contentRange: `bytes ${start}-${end}/${stats.size}`,
            ranged: true,
            rangeStart: start,
            rangeLength: opts.length,
        };
    } catch (error) {
        await handle.close();
        throw error;
    }
}

/**
 * Wraps the handle's stream so the handle is closed when iteration finishes, the
 * consumer breaks early, or the body reader drops the stream. `position` offsets the
 * stream to the start of a byte range and `length` caps the bytes yielded (a full-file
 * response leaves it undefined to stream to EOF). The caller must also close the handle
 * up-front on the paths that never stream (304 / HEAD).
 * @deprecated - No caller for this API
 */
export function streamWithCleanup(handle: FileHandle, position?: number, length?: number): BufferGenerator {
    return (async function* (): BufferGenerator {
        let remaining = length;
        try {
            for await (const chunk of handle.stream(undefined, position)) {
                if (remaining !== undefined && remaining <= 0) break;
                if (remaining === undefined || chunk.length <= remaining) {
                    yield chunk;
                    if (remaining !== undefined) remaining -= chunk.length;
                } else {
                    yield chunk.subarray(0, remaining);
                    remaining = 0;
                    break;
                }
            }
        } finally {
            await handle.close();
        }
    })();
}