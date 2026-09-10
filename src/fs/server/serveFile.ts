import FileHandle from "../file/FileHandle.js";
import FsError from "../common/FsError.js";
import {FsErrCode} from "../common/constants.js";

/** Root directory for relative urls. */
const DOCUMENT_ROOT = 'public';

/** Resolves `url` to a file path, rejecting traversal. */
function resolvePath(url: string): string {
    const clean = url.split('?')[0]?.split('#')[0] ?? url;
    if (clean.includes('..'))
        throw FsError.from(FsErrCode.INVALID_PATH, 'Path traversal is not allowed');
    if (clean.startsWith('/'))
        return `${DOCUMENT_ROOT}${clean === '/' ? '/index.html' : clean}`;
    return clean || 'index.html';
}

/** Reads the whole file addressed by `url` into memory. */
export async function serveStaticFile(url: string): Promise<Buffer> {
    const handle = await open(resolvePath(url));
    try {
        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream()) chunks.push(chunk);
        return Buffer.concat(chunks);
    } finally {
        await handle.close();
    }
}

/** Opens `path` read-only. */
export async function open(path: string): Promise<FileHandle> {
    return FileHandle.open(path);
}
