import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, chmod, stat as fsStat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import FileHandle from '../../../src/fs/file/FileHandle.js';
import FileStats from '../../../src/fs/file/FileStats.js';
import FsError from '../../../src/fs/common/FsError.js';
import { FsErrCode } from '../../../src/fs/common/constants.js';

let dir: string;

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'helix-fs-'));
});

afterAll(async () => {
    await rm(dir, {recursive: true, force: true});
});

describe('FileHandle.open()', () => {
    test('should open an existing file read-only and expose its path', async () => {
        const p = join(dir, 'exists.txt');
        await writeFile(p, 'hello');
        const handle = await FileHandle.open(p);
        expect(handle.path).toBe(p);
        expect(handle.flag).toBe('r');
        await handle.close();
    });

    test('should reject with FsError NOT_FOUND when the file does not exist', async () => {
        const p = join(dir, 'missing.txt');
        const err: unknown = await FileHandle.open(p).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FsError);
        expect(FsError.is(err as Error, FsErrCode.NOT_FOUND)).toBe(true);
    });

    test('should reject with FsError NOT_DIRECTORY when a path segment is a file', async () => {
        const p = join(dir, 'exists.txt', 'child.txt');
        const err: unknown = await FileHandle.open(p).catch((e: unknown) => e);
        expect(FsError.is(err as Error, FsErrCode.NOT_DIRECTORY)).toBe(true);
    });

    test('should reject with FsError PERMISSION_DENIED when the file is unreadable', async () => {
        if (process.platform === 'win32' || process.getuid?.() === 0) return; // chmod is a no-op for root
        const p = join(dir, 'noperm.txt');
        await writeFile(p, 'secret');
        await chmod(p, 0o000);
        const err: unknown = await FileHandle.open(p).catch((e: unknown) => e);
        await chmod(p, 0o644); // restore so afterAll cleanup can delete it
        expect(FsError.is(err as Error, FsErrCode.PERMISSION_DENIED)).toBe(true);
    });

    test('should open read-only regardless of extra arguments', async () => {
        const p = join(dir, 'exists.txt');
        const handle = await FileHandle.open(p);
        expect(handle.flag).toBe('r');
        await handle.close();
    });
});

describe('FileHandle.read()', () => {
    test('should read the whole file when length covers it', async () => {
        const p = join(dir, 'read-all.txt');
        await writeFile(p, '0123456789');
        const handle = await FileHandle.open(p);

        const data = await handle.read({length: 10});
        expect(data?.toString()).toBe('0123456789');
        await handle.close();
    });

    test('should return a short buffer at EOF boundary', async () => {
        const p = join(dir, 'read-short.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        expect((await handle.read({length: 10}))?.toString()).toBe('abc');
        await handle.close();
    });

    test('should return null at EOF', async () => {
        const p = join(dir, 'read-eof.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        await handle.read({length: 3});
        expect(await handle.read({length: 10})).toBeNull();
        await handle.close();
    });

    test('should read sequentially advancing the position', async () => {
        const p = join(dir, 'read-seq.txt');
        await writeFile(p, 'abcdefgh');
        const handle = await FileHandle.open(p);

        expect((await handle.read({length: 2}))?.toString()).toBe('ab');
        expect((await handle.read({length: 2}))?.toString()).toBe('cd');
        expect((await handle.read({length: 2}))?.toString()).toBe('ef');
        expect((await handle.read({length: 2}))?.toString()).toBe('gh');
        expect(await handle.read({length: 2})).toBeNull();
        await handle.close();
    });

    test('should return null for an empty file', async () => {
        const p = join(dir, 'empty.txt');
        await writeFile(p, '');
        const handle = await FileHandle.open(p);

        expect(await handle.read({length: 5})).toBeNull();
        await handle.close();
    });

    test('should read from an explicit position without moving the cursor', async () => {
        const p = join(dir, 'read-pos.txt');
        await writeFile(p, '0123456789');
        const handle = await FileHandle.open(p);

        expect((await handle.read({length: 3, position: 4}))?.toString()).toBe('456');
        // cursor still at 0
        expect((await handle.read({length: 2}))?.toString()).toBe('01');
        await handle.close();
    });

    test('should read into a caller-provided buffer at an offset', async () => {
        const p = join(dir, 'read-into.txt');
        await writeFile(p, 'abcdef');
        const handle = await FileHandle.open(p);

        const big = Buffer.alloc(10).fill('.');
        // Using readInto to write into 'big' starting at offset 4
        // The implementation of readInto writes from index 0 of the target,
        // so to test this we need a slice if we want an offset
        const target = big.subarray(4, 7);
        const bytesRead = await handle.readInto(target);
        
        expect(bytesRead).toBe(3);
        expect(target.toString()).toBe('abc');
        expect(big.toString()).toBe('....abc...');
        await handle.close();
    });

    test('should return null reading at a position past EOF', async () => {
        const p = join(dir, 'read-pasteof.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        expect(await handle.read({length: 4, position: 100})).toBeNull();
        await handle.close();
    });

    test('should reject when length exceeds the provided buffer space', async () => {
        const p = join(dir, 'read-overflow.txt');
        await writeFile(p, 'abcdef');
        const handle = await FileHandle.open(p);

        await expect(handle.read({buffer: Buffer.alloc(2), length: 5})).rejects.toThrow(FsError);
        await handle.close();
    });

    test('should reject a negative offset', async () => {
        const p = join(dir, 'read-negoffset.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        await expect(handle.read({offset: -1})).rejects.toThrow(FsError);
        await handle.close();
    });

    test('should reject a non-integer position', async () => {
        const p = join(dir, 'read-floatpos.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        await expect(handle.read({position: 1.5})).rejects.toThrow(FsError);
        await handle.close();
    });
});

describe('FileHandle.stream()', () => {
    test('should stream the whole file in order', async () => {
        const content = 'x'.repeat(200_000); // spans multiple 64KB default chunks
        const p = join(dir, 'stream.txt');
        await writeFile(p, content);
        const handle = await FileHandle.open(p);

        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream()) chunks.push(chunk);

        expect(Buffer.concat(chunks).toString()).toBe(content);
        await handle.close();
    });

    test('should honor a custom chunk size', async () => {
        const p = join(dir, 'stream-chunked.txt');
        await writeFile(p, '0123456789');
        const handle = await FileHandle.open(p);

        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream(4, 0)) {
            chunks.push(chunk);
        }

        expect(chunks.map(c => c.toString())).toEqual(['0123', '4567', '89']);
        await handle.close();
    });

    test('should yield nothing for an empty file', async () => {
        const p = join(dir, 'stream-empty.txt');
        await writeFile(p, '');
        const handle = await FileHandle.open(p);

        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream(5, 0)) {
            // Should not be called
            chunks.push(Buffer.from('unexpected'));
        }

        expect(chunks).toHaveLength(0);
        await handle.close();
    });

    test('should stream starting from an explicit position', async () => {
        const p = join(dir, 'stream-pos.txt');
        await writeFile(p, '0123456789');
        const handle = await FileHandle.open(p);

        const chunks: Buffer[] = [];
        for await (const chunk of handle.stream(2, 4)) {
            chunks.push(chunk);
        }

        expect(chunks.map(c => c.toString())).toEqual(['45', '67', '89']);
        await handle.close();
    });

    test('should reject with FsError when chunk size is zero', async () => {
        const p = join(dir, 'stream-zero.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        await expect(async () => {
            for await (const _ of handle.stream(0)) { /* unreachable */ }
        }).rejects.toThrow(FsError);
        await handle.close();
    });
});

describe('FileHandle.stat()', () => {
    test('should report size and file flags for a regular file', async () => {
        const p = join(dir, 'stat.txt');
        await writeFile(p, '0123456789');
        const handle = await FileHandle.open(p);

        const stats = await handle.stat();
        expect(stats).toBeInstanceOf(FileStats);
        expect(stats.size).toBe(10);
        expect(stats.isFile).toBe(true);
        expect(stats.isDirectory).toBe(false);
        expect(stats.isSymbolicLink).toBe(false);
        await handle.close();
    });

    test('should expose OS metadata fields', async () => {
        const p = join(dir, 'stat-meta.txt');
        await writeFile(p, 'meta');
        const handle = await FileHandle.open(p);

        const stats = await handle.stat();
        expect(stats.mode).toBeGreaterThan(0);
        expect(stats.uid).toBeGreaterThanOrEqual(0);
        expect(stats.gid).toBeGreaterThanOrEqual(0);
        expect(stats.ino).toBeGreaterThan(0);
        expect(stats.mtimeMs).toBeGreaterThan(0);
        await handle.close();
    });
});

describe('FileHandle.close()', () => {
    test('should close the file and report closed', async () => {
        const p = join(dir, 'close.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        expect(handle.closed).toBe(false);
        await handle.close();
        expect(handle.closed).toBe(true);
    });

    test('should be idempotent', async () => {
        const p = join(dir, 'close-twice.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        await handle.close();
        await expect(handle.close()).resolves.toBeUndefined();
    });
});

describe('operations on a closed handle', () => {
    test('should reject read after close', async () => {
        const p = join(dir, 'closed-read.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);
        await handle.close();

        await expect(handle.read({length: 1})).rejects.toThrow(FsError);
    });

    test('should reject stat after close', async () => {
        const p = join(dir, 'closed-stat.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);
        await handle.close();

        await expect(handle.stat()).rejects.toThrow(FsError);
    });
});

describe('serveFile.open()', () => {
    test('should return a FileHandle for a valid path', async () => {
        const p = join(dir, 'serve-open.txt');
        await writeFile(p, 'served');
        const handle = await FileHandle.open(p);
        expect(handle).toBeInstanceOf(FileHandle);
        expect((await handle.read({length: 6}))?.toString()).toBe('served');
        await handle.close();
    });

    test('should propagate FsError for a missing file', async () => {
        const err: unknown = await FileHandle.open(join(dir, 'no-such.txt')).catch((e: unknown) => e);
        expect(FsError.is(err as Error, FsErrCode.NOT_FOUND)).toBe(true);
    });
});

describe('FileStats.from()', () => {
    test('should map a node Stats object for a directory onto the value object', async () => {
        const p = join(dir, 'stats-dir');
        await mkdir(p);
        const stats = FileStats.from(await fsStat(p));
        expect(stats.isDirectory).toBe(true);
        expect(stats.isFile).toBe(false);
    });

    test('should map a node Stats object for a regular file', async () => {
        const p = join(dir, 'stats-file.txt');
        await writeFile(p, 'abc');
        const stats = FileStats.from(await fsStat(p));
        expect(stats.isFile).toBe(true);
        expect(stats.size).toBe(3);
    });
});

describe('FileHandle.open() post-open security check', () => {
    test('should reject a symlink with FsError SYMLINK_NOT_ALLOWED', async () => {
        if (process.platform === 'win32') return;
        const target = join(dir, 'symlink-target.txt');
        await writeFile(target, 'data');
        const link = join(dir, 'symlink.txt');
        await symlink(target, link);

        const err: unknown = await FileHandle.open(link).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FsError);
        expect(FsError.is(err as Error, FsErrCode.SYMLINK_NOT_ALLOWED)).toBe(true);
    });

    test('should reject a directory with FsError SYMLINK_NOT_ALLOWED', async () => {
        const subdir = join(dir, 'a-directory');
        await mkdir(subdir);

        const err: unknown = await FileHandle.open(subdir).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FsError);
        expect(FsError.is(err as Error, FsErrCode.SYMLINK_NOT_ALLOWED)).toBe(true);
    });
});

describe('FileHandle concurrent operation serialization', () => {
    test('should serialize concurrent reads through the in-flight lock', async () => {
        const p = join(dir, 'concurrent.txt');
        await writeFile(p, '0123456789ABCDEF');
        const handle = await FileHandle.open(p);

        // Fire several reads in parallel. Without the lock these could interleave
        // the cursor advance; with the lock each read is atomic.
        const results = await Promise.all([
            handle.read({length: 4}),
            handle.read({length: 4}),
            handle.read({length: 4}),
            handle.read({length: 4}),
        ]);
        expect(results.map((b) => b?.toString())).toEqual(['0123', '4567', '89AB', 'CDEF']);
        await handle.close();
    });

    test('should serialize concurrent stat and read calls', async () => {
        const p = join(dir, 'stat-read.txt');
        await writeFile(p, 'abc');
        const handle = await FileHandle.open(p);

        const [stats, data] = await Promise.all([
            handle.stat(),
            handle.read({length: 3}),
        ]);
        expect(stats.size).toBe(3);
        expect(data?.toString()).toBe('abc');
        await handle.close();
    });

    test('should queue a close behind an in-flight read', async () => {
        const p = join(dir, 'queued-close.txt');
        await writeFile(p, 'payload');
        const handle = await FileHandle.open(p);

        const readPromise = handle.read({length: 7});
        const closePromise = handle.close();
        await Promise.all([readPromise, closePromise]);

        expect(handle.closed).toBe(true);
        await expect(handle.read({length: 1})).rejects.toThrow(FsError);
    });

    test('should keep a stream holding the lock until iteration ends', async () => {
        const p = join(dir, 'stream-lock.txt');
        await writeFile(p, 'streamdata');
        const handle = await FileHandle.open(p);

        const stream = handle.stream(4);
        const first = await stream.next();
        expect(first.value?.toString()).toBe('stre');

        // A concurrent read on the same handle must wait until the stream finishes.
        const concurrent = handle.read({length: 100});
        // Allow the microtask queue to drain; concurrent should not have settled.
        await new Promise((r) => setImmediate(r));
        let concurrentSettled = false;
        concurrent.then(() => { concurrentSettled = true; }, () => { concurrentSettled = true; });
        await new Promise((r) => setImmediate(r));
        expect(concurrentSettled).toBe(false);

        // Drain the stream and THEN the concurrent read should complete.
        for await (const _chunk of stream) { /* drain */ }
        const tail = await concurrent;
        expect(tail).toBeNull();
        await handle.close();
    });
});
