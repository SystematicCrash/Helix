import {realpath} from "node:fs/promises";
import FileHandle from "../file/FileHandle.js";
import FsError from "../common/FsError.js";
import {DOCUMENT_ROOT, FsErrCode} from "../common/constants.js";

/** Resolves `url` to a file path, rejecting traversal. */
function resolvePath(url: string): string {
    const clean = url.split('?')[0]?.split('#')[0] ?? url;
    if (clean.includes('..'))
        throw FsError.from(FsErrCode.INVALID_PATH, 'Path traversal is not allowed');
    if (clean.startsWith('/'))
        return `${DOCUMENT_ROOT}${clean === '/' ? '/index.html' : clean}`;
    return clean || 'index.html';
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

/** Reads the whole file addressed by `url` into memory, refusing to leave the document root. */
export async function serveStaticFile(url: string): Promise<Buffer> {
    const filePath = resolvePath(url);
    const handle = await FileHandle.open(filePath);
    try {
        // Post-open check: the kernel FD is bound to an inode, but the path we
        // hold could point at a symlink that the attacker swapped in after open.
        // realpath on the requested path dereferences symlinks; we then verify
        // the final target is still inside the document root.
        const resolved = await realpath(filePath).catch(() => filePath);
        await assertInsideRoot(resolved);
        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream()) chunks.push(chunk);
        return Buffer.concat(chunks);
    } finally {
        await handle.close();
    }
}
