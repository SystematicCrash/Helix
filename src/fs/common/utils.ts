import {ByteRange} from "../../common/types.js";
import {RawIOOptions} from "./types.js";
import {DOCUMENT_ROOT, FsErrCode, FsError} from "../index.js";
import {realpath} from "node:fs/promises";

/**
 * Maps a ByteRange to RawIOOptions for file reading.
 * Returns null if the range cannot be satisfied (RFC 9110 §14.2 -> HTTP 416).
 */
export function rangeToIOOptions(range: ByteRange, fileSize: number): RawIOOptions | null {
    if (fileSize <= 0) return null;

    let position: number;
    let endOffset: number;

    if (range.suffix !== undefined) {
        position = Math.max(0, fileSize - range.suffix);
        endOffset = fileSize - 1;
    } else {
        position = range.start ?? 0;
        endOffset = range.end === -1
            ? fileSize - 1
            : Math.min(range.end, fileSize - 1);
    }

    if (position >= fileSize || position > endOffset) {
        return null;
    }

    const length = endOffset - position + 1;

    return { position, length, offset: 0 };
}

/** Resolves `url` to a file path, rejecting traversal. */
export function resolvePath(url: string): string {
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
export async function assertInsideRoot(resolved: string): Promise<void> {
    const rootReal = await realpath(DOCUMENT_ROOT).catch(() => DOCUMENT_ROOT);
    const rootPrefix = rootReal.endsWith('/') ? rootReal : `${rootReal}/`;
    if (resolved !== rootReal && !resolved.startsWith(rootPrefix)) {
        throw FsError.from(FsErrCode.PATH_OUTSIDE_ROOT, `Resolved path ${resolved} is outside ${rootReal}`);
    }
}