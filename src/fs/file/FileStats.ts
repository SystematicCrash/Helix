/** Immutable stat(2) snapshot of a file. */
export default class FileStats {
    constructor(
        public readonly size: number,
        public readonly isDirectory: boolean,
        public readonly isFile: boolean,
        public readonly isSymbolicLink: boolean,
        /** POSIX permission bits, e.g. 0o644. */
        public readonly mode: number,
        public readonly dev: number,
        public readonly ino: number,
        public readonly nlink: number,
        public readonly uid: number,
        public readonly gid: number,
        /** Milliseconds since epoch. */
        public readonly atimeMs: number,
        public readonly mtimeMs: number,
        public readonly ctimeMs: number,
        public readonly birthtimeMs: number,
    ) {}

    /** Adapts a node:fs Stats object. */
    static from(stats: {
        size: number;
        isDirectory(): boolean;
        isFile(): boolean;
        isSymbolicLink(): boolean;
        mode: number;
        dev: number;
        ino: number;
        nlink: number;
        uid: number;
        gid: number;
        atimeMs: number;
        mtimeMs: number;
        ctimeMs: number;
        birthtimeMs: number;
    }): FileStats {
        return new FileStats(
            stats.size,
            stats.isDirectory(),
            stats.isFile(),
            stats.isSymbolicLink(),
            stats.mode,
            stats.dev,
            stats.ino,
            stats.nlink,
            stats.uid,
            stats.gid,
            stats.atimeMs,
            stats.mtimeMs,
            stats.ctimeMs,
            stats.birthtimeMs,
        );
    }
}
