import {open as fsOpen} from "node:fs/promises";
import FileStats from "./FileStats.js";
import {DEFAULT_READ_CHUNK_SIZE, FsErrCode, FsOperation, errnoToFsErrCode} from "../common/constants.js";
import FsError from "../common/FsError.js";
import {RawIOOptions, IOOptions, resolveIOOptions} from "./IOOptions.js";

/** Read-only file handle. Wraps node:fs/promises FileHandle; all errors surface as FsError. */
export default class FileHandle {
    private _closed = false;

    private constructor(
        private readonly handle: import("node:fs/promises").FileHandle,
        public readonly path: string,
        public readonly flag: string,
    ) {}

    /** Opens `path` read-only. */
    static async open(path: string): Promise<FileHandle> {
        let handle;
        try {
            handle = await fsOpen(path, 'r');
        } catch (err) {
            const errno = (err as NodeJS.ErrnoException)?.code;
            throw FsError.from(errnoToFsErrCode(errno, FsErrCode.OPEN_FAILED), err instanceof Error ? err.message : String(err));
        }
        return new FileHandle(handle, path, 'r');
    }

    /** Returns the file's metadata. */
    public async stat(): Promise<FileStats> {
        this.assertNotClosed(FsOperation.STAT);
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
    public async read(opts?: RawIOOptions): Promise<Buffer | null> {
        this.assertNotClosed(FsOperation.READ);
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
        if (this._closed) return;
        this._closed = true;
        try {
            await this.handle.close();
        } catch (err) {
            throw this.wrap(err, FsErrCode.CLOSE_FAILED);
        }
    }

    /** True once close() has been called. */
    public get closed(): boolean {
        return this._closed;
    }
    private assertNotClosed(operation: FsOperation): void {
        if (this._closed)
            throw FsError.from(FsErrCode.INVALID_ARGUMENT, `Cannot ${operation} from a closed file (${this.path})`);
    }

    private wrap(err: unknown, code: FsErrCode): FsError {
        return FsError.from(code, err instanceof Error ? err.message : String(err));
    }
}
