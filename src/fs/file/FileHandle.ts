import {open as fsOpen} from "node:fs/promises";
import {constants as fsConstants} from "node:fs";
import FileStats from "./FileStats.js";
import {DEFAULT_READ_CHUNK_SIZE, FsErrCode, FsOperation, errnoToFsErrCode} from "../common/constants.js";
import FsError from "../common/FsError.js";
import {resolveIOOptions} from "./IOOptions.js";
import {IOOptions, RawIOOptions} from "../common/types.js";

/** Resolves a value from the previous in-flight operation, or undefined if none. */
type Tail = Promise<unknown> | undefined;

/**
 * Read-only file handle. Wraps node:fs/promises FileHandle; all errors surface as FsError.
 *
 * All public operations (open, read, stat, stream, close) serialize through a single
 * in-flight lock, so a handle can never issue two reads concurrently. stream() drives
 * the lock via an internal read primitive that bypasses the lock to avoid self-deadlock.
 */
export default class FileHandle {
    private _closed = false;
    private inFlight: Tail = undefined;

    private constructor(
        private readonly handle: import("node:fs/promises").FileHandle,
        public readonly path: string,
        public readonly flag: string,
    ) {}

    /** Opens file read-only, preventing symlink traversal and non-regular files. */
    static async open(path: string): Promise<FileHandle> {
        let handle;
        try {
            handle = await fsOpen(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
        } catch (err) {
            const errno = (err as NodeJS.ErrnoException)?.code;
            if (errno === 'ELOOP') {
                throw FsError.from(FsErrCode.SYMLINK_NOT_ALLOWED, `Refusing to open symlink at ${path}`);
            }
            throw FsError.from(errnoToFsErrCode(errno, FsErrCode.OPEN_FAILED), err instanceof Error ? err.message : String(err));
        }
        try {
            const stats = await handle.stat();
            if (!stats.isFile()) {
                await handle.close().catch(() => {});
                throw FsError.from(FsErrCode.SYMLINK_NOT_ALLOWED, `Refusing to open non-regular file at ${path}`);
            }
        } catch (err) {
            if (err instanceof FsError) throw err;
            await handle.close().catch(() => {});
            throw FsError.from(FsErrCode.STAT_FAILED, err instanceof Error ? err.message : String(err));
        }
        return new FileHandle(handle, path, 'r');
    }

    /** Returns the file's metadata. Serializes through the in-flight lock. */
    public async stat(): Promise<FileStats> {
        return this.runExclusive(async () => {
            this.assertNotClosed(FsOperation.STAT);
            try {
                return FileStats.from(await this.handle.stat());
            } catch (err) {
                throw this.wrap(err, FsErrCode.STAT_FAILED);
            }
        });
    }

    /**
     * Reads up to `length` bytes from `position` into `target`.
     * Returns the number of bytes read, or null at EOF.
     */
    public async readInto(target: Buffer, position?: number): Promise<number | null> {
        return this.runExclusive(async () => {
            this.assertNotClosed(FsOperation.READ);
            try {
                const {bytesRead} = await this.handle.read(target, 0, target.length, position ?? null);
                return bytesRead === 0 ? null : bytesRead;
            } catch (err) {
                throw this.wrap(err, FsErrCode.READ_FAILED);
            }
        });
    }

    /**
     * Reads up to `length` bytes from `position` (or the cursor).
     * Returns null at EOF. Serializes through the in-flight lock.
     */
    public async read(opts?: RawIOOptions): Promise<Buffer | null> {
        return this.runExclusive(() => this.readBypassingLock(opts));
    }

    /**
     * Yields the file contents in `chunkSize` chunks, optionally from `position` to EOF.
     * Holds the in-flight lock for the lifetime of the stream so concurrent reads/stat/close
     * on the same handle wait until iteration finishes.
     */
    public async *stream(
        chunkSize: number = DEFAULT_READ_CHUNK_SIZE, 
        position?: number,
        target?: Buffer
    ): AsyncGenerator<Buffer | number> {
        if (chunkSize <= 0 || !Number.isInteger(chunkSize))
            throw FsError.from(FsErrCode.INVALID_ARGUMENT, 'Chunk size must be a positive integer');

        let release: () => void;
        const acquired = new Promise<void>((resolve) => { release = resolve; });
        this.inFlight = Promise.resolve(this.inFlight).then(() => acquired);
        
        // Use provided target or allocate one if needed
        const buffer = target ?? Buffer.allocUnsafe(chunkSize);
        
        try {
            this.assertNotClosed(FsOperation.READ);
            while (true) {
                // If caller provided a target, use readInto to avoid new buffer creation
                if (target) {
                    const bytesRead = await this.readInto(buffer, position);
                    if (bytesRead === null) return;
                    if (position !== undefined) position += bytesRead;
                    yield bytesRead;
                } else {
                    const chunk = await this.readBypassingLock({length: chunkSize, position});
                    if (chunk === null) return;
                    if (position !== undefined) position += chunk.length;
                    yield chunk;
                }
            }
        } finally {
            release!();
        }
    }

    /** Closes the handle. Idempotent. Serializes through the in-flight lock. */
    public async close(): Promise<void> {
        if (this._closed) return;
        await this.runExclusive(async () => {
            if (this._closed) return;
            this._closed = true;
            try {
                await this.handle.close();
            } catch (err) {
                this._closed = false;
                throw this.wrap(err, FsErrCode.CLOSE_FAILED);
            }
        });
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

    /**
     * Runs `fn` only after every previously-scheduled operation has settled,
     * so concurrent calls on the same handle are strictly serialized.
     */
    private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
        const prev = this.inFlight ?? Promise.resolve();
        const next = prev.then(fn, fn);
        this.inFlight = next.catch(() => {});
        return next;
    }

    /** Internal read bypassing the in-flight lock; used by stream() which owns the lock. */
    private async readBypassingLock(opts?: RawIOOptions): Promise<Buffer | null> {
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
}
