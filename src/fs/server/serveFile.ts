import {realpath} from "node:fs/promises";
import FileHandle from "../file/FileHandle.js";
import FsError from "../common/FsError.js";
import {DOCUMENT_ROOT, FsErrCode} from "../common/constants.js";
import {BufferGenerator, StaticFileStream} from "../../network/http/common/types.js";
import {ByteRange} from "../../common/types.js";
import {rangeToIOOptions} from "../common/utils.js";
import HttpError from "../../network/http/common/HttpError.js";

export async function serveStaticFile(
    url: string,
    rangeSet: ByteRange[] = []
): Promise<StaticFileStream> {
    const filePath = resolvePath(url);
    const handle = await FileHandle.open(filePath);

    try {
        const resolved = await realpath(filePath).catch(() => filePath);
        await assertInsideRoot(resolved);

        const stat = await handle.getStats();

        if (!rangeSet.length) {
            return {
                stream: streamWithCleanup(handle),
                size: stat.size,
                status: 200,
            };
        }

        const range = rangeSet[0]!;
        const opts = rangeToIOOptions(range, stat.size);

        if (!opts || opts.position === null || opts.position === undefined || opts.length === undefined) {
            throw new HttpError(416, "Range Not Satisfiable");
        }

        const start = opts.position;
        const end = start + opts.length - 1;
        return {
            stream: streamRangeWithCleanup(handle, opts.position, opts.length),
            size: opts.length,
            status: 206,
            contentRange: `bytes ${start}-${end}/${(stat.size)}`,
        };
    } catch (err) {
        await handle.close();
        throw err;
    }
}

/** Streams the full file and guarantees handle closure on termination or break */
async function* streamWithCleanup(handle: FileHandle): BufferGenerator {
    try {
        yield* handle.stream();
    } finally {
        await handle.close();
    }
}

/** Streams a bounded range slice and guarantees handle closure */
async function* streamRangeWithCleanup(
    handle: FileHandle,
    startPos: number,
    totalLength: number
): BufferGenerator {
    let remaining = totalLength;
    try {
        for await (const chunk of handle.stream(undefined, startPos)) {
            if (remaining <= 0) break;

            if (chunk.length <= remaining) {
                yield chunk;
                remaining -= chunk.length;
            } else {
                yield chunk.subarray(0, remaining);
                remaining = 0;
                break;
            }
        }
    } finally {
        await handle.close();
    }
}

/** Resolves `url` to a file path, rejecting traversal. */
function resolvePath(url: string): string {
    const clean = url.split('?')[0]?.split('#')[0] ?? url;
    if (clean.includes('..'))
        throw FsError.from(FsErrCode.INVALID_PATH, 'Path traversal is not allowed');
    return `${DOCUMENT_ROOT}/${clean}`;
}

/**
 * Verifies that `resolved` (a realpath) is contained inside the document root.
 * Defeats TOCTOU where an attacker replaces a regular file with a symlink to
 * /etc/passwd (or anywhere outside the root) between path validation and open.
 */
async function assertInsideRoot(resolved: string): Promise<void> {
    const rootReal = await realpath(DOCUMENT_ROOT).catch(() => DOCUMENT_ROOT);
    const rootPrefix = rootReal.endsWith('/') ? rootReal : `${rootReal}/`;
    if (resolved !== rootReal && !resolved.startsWith(rootPrefix)) {
        throw FsError.from(FsErrCode.PATH_OUTSIDE_ROOT, `Resolved path ${resolved} is outside ${rootReal}`);
    }
}
