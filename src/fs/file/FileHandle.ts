import {open as fsOpen} from "node:fs/promises";
import FileStats from "./FileStats.js";
import {DEFAULT_READ_CHUNK_SIZE, FsErrCode} from "../common/constants.js";
import FsError from "../common/FsError.js";
import {RawIOOptions, IOOptions, resolveIOOptions} from "./IOOptions.js";

/** Read-only file handle. Wraps node:fs/promises FileHandle; all errors surface as FsError. */
export default class FileHandle {
    private closed_ = false;

    private constructor(
        private readonly handle: import("node:fs/promises").FileHandle,
        public readonly path: string,
        /** Node flag string the handle was opened with. */
        public readonly flag: string,
    ) {}

    /** Opens `path` read-only. */
    static async open(path: string): Promise<FileHandle> {
        let handle;
        try {
            handle = await fsOpen(path, 'r');
        } catch (err) {
            throw FsError.from(mapOpenError(err), err instanceof Error ? err.message : String(err));
        }
        return new FileHandle(handle, path, 'r');
    }

    public async stat(): Promise<FileStats> {
        this.assertNotClosed('stat');
        try {
            return FileStats.from(await this.handle.stat());
        } catch (err) {
            throw this.wrap(err, FsErrCode.STAT_FAILED);
        }
    }

    /**
     * Reads up to `length` bytes from `position` (or the cursor).
     * Returns null at EOF.
     */
    public async read(opts?: RawIOOptions | number): Promise<Buffer | null> {
        this.assertNotClosed('read');
        const {buffer, offset, length, position}: IOOptions = resolveIOOptions(opts);

        try {
            const {bytesRead} = await this.handle.read(buffer, offset, length, position);
            if (bytesRead === 0) return null; // EOF
            return buffer.subarray(offset, offset + bytesRead);
        } catch (err) {
            throw this.wrap(err, FsErrCode.READ_FAILED);
        }
    }

    /** Yields the file contents in `chunkSize` chunks, optionally from `position` to EOF. */
    public async *stream(chunkSize: number = DEFAULT_READ_CHUNK_SIZE, position?: number): AsyncGenerator<Buffer> {
        if (chunkSize <= 0 || !Number.isInteger(chunkSize))
            throw FsError.from(FsErrCode.INVALID_ARGUMENT, 'Chunk size must be a positive integer');

        while (true) {
            const chunk = await this.read({length: chunkSize, position});
            if (chunk === null) return;
            if (position) position += chunk.length;
            yield chunk;
        }
    }

    /** Closes the handle. Idempotent. */
    public async close(): Promise<void> {
        if (this.closed_) return;
        this.closed_ = true;
        try {
            await this.handle.close();
        } catch (err) { // TODO: shouldn't we set the closed_ to false after failure?
            throw this.wrap(err, FsErrCode.CLOSE_FAILED);
        }
    }

    /** True once close() has been called. */
    public get closed(): boolean {
        return this.closed_;
    }

    private assertNotClosed(operation: string): void {
        if (this.closed_)
            throw FsError.from(FsErrCode.INVALID_ARGUMENT, `Cannot ${operation} from a closed file (${this.path})`);
    }

    private wrap(err: unknown, code: FsErrCode): FsError {
        return FsError.from(code, err instanceof Error ? err.message : String(err));
    }
}

/** Maps node open() errno codes to FsErrCode. */
function mapOpenError(err: unknown): FsErrCode {
    const code = (err as NodeJS.ErrnoException)?.code;
    switch (code) {
        case 'ENOENT': return FsErrCode.NOT_FOUND;
        case 'EACCES':
        case 'EPERM':  return FsErrCode.PERMISSION_DENIED;
        case 'EISDIR': return FsErrCode.IS_DIRECTORY;
        case 'ENOTDIR': return FsErrCode.NOT_DIRECTORY;
        case 'EEXIST': return FsErrCode.ALREADY_EXISTS;
        case 'ENAMETOOLONG': return FsErrCode.PATH_TOO_LONG;
        case 'ENOSPC': return FsErrCode.OUT_OF_SPACE;
        default: return FsErrCode.OPEN_FAILED;
    }
}
