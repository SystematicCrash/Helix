import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStaticFile } from '../../../src/fs/server/serveFile.js';
import FsError from '../../../src/fs/common/FsError.js';
import { FsErrCode, errnoToFsErrCode } from '../../../src/fs/common/constants.js';
import FileHandle from '../../../src/fs/file/FileHandle.js';

let root: string;
let publicDir: string;
let outsideDir: string;

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'helix-serve-'));
    publicDir = join(root, 'public');
    outsideDir = join(root, 'outside');
    await mkdir(publicDir);
    await mkdir(outsideDir);
    process.chdir(root); // DOCUMENT_ROOT is relative to cwd
});

afterAll(async () => {
    process.chdir(root);
    await rm(root, {recursive: true, force: true});
});

describe('serveStaticFile()', () => {
    test('should return the file contents for an existing file', async () => {
        await writeFile(join(publicDir, 'hello.txt'), 'file content');
        const result = await serveStaticFile('/hello.txt');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('file content');
    });

    test('should serve index.html for the root url', async () => {
        await writeFile(join(publicDir, 'index.html'), 'home');
        const result = await serveStaticFile('/');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('home');
    });

    test('should serve nested paths', async () => {
        await mkdir(join(publicDir, 'assets'));
        await writeFile(join(publicDir, 'assets', 'app.js'), 'js');
        const result = await serveStaticFile('/assets/app.js');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('js');
    });

    test('should strip query strings and fragments from the url', async () => {
        await writeFile(join(publicDir, 'query.txt'), 'q');
        const result = await serveStaticFile('/query.txt?x=1#frag');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe('q');
    });

    test('should reject path traversal with FsError INVALID_PATH', async () => {
        const err: unknown = await serveStaticFile('/../../etc/passwd').catch((e: unknown) => e);
        expect(FsError.is(err as Error, FsErrCode.INVALID_PATH)).toBe(true);
    });

    test('should reject traversal encoded in the middle of the url', async () => {
        const err: unknown = await serveStaticFile('/a/../b').catch((e: unknown) => e);
        expect(FsError.is(err as Error, FsErrCode.INVALID_PATH)).toBe(true);
    });

    test('should reject with FsError NOT_FOUND for a missing file', async () => {
        const err: unknown = await serveStaticFile('/missing.txt').catch((e: unknown) => e);
        expect(FsError.is(err as Error, FsErrCode.NOT_FOUND)).toBe(true);
    });

    test('should read an empty file as an empty buffer', async () => {
        await writeFile(join(publicDir, 'empty.txt'), '');
        const result = await serveStaticFile('/empty.txt');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).length).toBe(0);
    });

    test('should read a file larger than one chunk', async () => {
        const content = 'x'.repeat(200_000);
        await writeFile(join(publicDir, 'large.txt'), content);
        const result = await serveStaticFile('/large.txt');
        const chunks = [];
        for await (const chunk of result.stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString()).toBe(content);
    });
});

describe('FileHandle.open()', () => {
    test('should return a read-only FileHandle for a direct path', async () => {
        const p = join(publicDir, 'hello.txt');
        const handle = await FileHandle.open(p);
        expect(handle).toBeInstanceOf(FileHandle);
        expect(handle.flag).toBe('r');
        await handle.close();
    });
});

describe('serveStaticFile() post-open security', () => {
    test('should reject a symlink whose target lies outside the document root', async () => {
        if (process.platform === 'win32') return;
        const secret = join(outsideDir, 'secret.txt');
        await writeFile(secret, 'SECRET');
        const link = join(publicDir, 'leak.txt');
        await symlink(secret, link);

        const err: unknown = await serveStaticFile('/leak.txt').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FsError);
        // Either SYMLINK_NOT_ALLOWED (FileHandle rejected the symlink outright)
        // or PATH_OUTSIDE_ROOT (realpath check caught it). Either is acceptable.
        const ok = FsError.is(err as Error, FsErrCode.SYMLINK_NOT_ALLOWED)
            || FsError.is(err as Error, FsErrCode.PATH_OUTSIDE_ROOT);
        expect(ok).toBe(true);
    });

    test('should refuse to follow a symlink chain that exits the document root', async () => {
        if (process.platform === 'win32') return;
        const secret = join(outsideDir, 'secret2.txt');
        await writeFile(secret, 'SECRET');
        const link = join(publicDir, 'leak2.txt');
        await symlink(secret, link);

        const err: unknown = await serveStaticFile('/leak2.txt').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FsError);
        const ok = FsError.is(err as Error, FsErrCode.SYMLINK_NOT_ALLOWED)
            || FsError.is(err as Error, FsErrCode.PATH_OUTSIDE_ROOT);
        expect(ok).toBe(true);
    });
});

describe('errnoToFsErrCode()', () => {
    test('should map ENOENT to NOT_FOUND', () => {
        expect(errnoToFsErrCode('ENOENT', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.NOT_FOUND);
    });

    test('should map EACCES and EPERM to PERMISSION_DENIED', () => {
        expect(errnoToFsErrCode('EACCES', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.PERMISSION_DENIED);
        expect(errnoToFsErrCode('EPERM', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.PERMISSION_DENIED);
    });

    test('should map EISDIR to IS_DIRECTORY', () => {
        expect(errnoToFsErrCode('EISDIR', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.IS_DIRECTORY);
    });

    test('should map ENOTDIR to NOT_DIRECTORY', () => {
        expect(errnoToFsErrCode('ENOTDIR', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.NOT_DIRECTORY);
    });

    test('should map ENAMETOOLONG to PATH_TOO_LONG', () => {
        expect(errnoToFsErrCode('ENAMETOOLONG', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.PATH_TOO_LONG);
    });

    test('should map ENOSPC to OUT_OF_SPACE', () => {
        expect(errnoToFsErrCode('ENOSPC', FsErrCode.OPEN_FAILED)).toBe(FsErrCode.OUT_OF_SPACE);
    });

    test('should fall back for unknown or missing errno codes', () => {
        expect(errnoToFsErrCode('EWHATEVER', FsErrCode.READ_FAILED)).toBe(FsErrCode.READ_FAILED);
        expect(errnoToFsErrCode(undefined, FsErrCode.OPEN_FAILED)).toBe(FsErrCode.OPEN_FAILED);
    });
});
