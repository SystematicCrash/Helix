import FileHandle from "../file/FileHandle.js";

export async function serveStaticFile(): Promise<Buffer> {
    // TODO: Implement serving logic
    throw new Error('Not implemented');
}

/** Opens `path` read-only. */
export async function open(path: string): Promise<FileHandle> {
    return FileHandle.open(path);
}
