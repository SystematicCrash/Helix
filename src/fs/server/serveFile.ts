// src/fs/server/serveFile.ts (or src/fs/file/openFile.ts)
import { realpath } from "node:fs/promises";
import FileHandle from "../file/FileHandle.js";
import { assertInsideRoot, resolvePath } from "../common/utils.js";

/**
 * Resolves a relative path within the document root, verifies against
 * directory traversal / symlink escapes, and returns the open handle.
 */
export async function openSandboxedFile(relativePath: string): Promise<FileHandle> {
    const filePath = resolvePath(relativePath);
    const handle = await FileHandle.open(filePath);

    try {
        const resolved = await realpath(filePath).catch(() => filePath);
        await assertInsideRoot(resolved);
        return handle;
    } catch (error) {
        await handle.close();
        throw error;
    }
}