import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStaticFile, open } from '../../../src/fs/server/serveFile.js';
import FsError from '../../../src/fs/common/FsError.js';
import { FsErrCode, errnoToFsErrCode } from '../../../src/fs/common/constants.js';
import FileHandle from '../../../src/fs/file/FileHandle.js';

let root: string;
let publicDir: string;

beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'helix-serve-'));
    publicDir = join(root, 'public');
    await mkdir(publicDir);
    process.chdir(root); // DOCUMENT_ROOT is relative to cwd
});

afterAll(async () => {
    process.chdir(root);
    await rm(root, {recursive: true, force: true});
});

describe('serveStaticFile()', () => {
    test('should return the file contents for an existing file', async () => {
        await writeFile(join(publicDir, 'hello.txt'), 'file content');
        const content = await serveStaticFile('/hello.txt');
        expect(content.toString()).toBe('file content');
    });

    test('should serve index.html for the root url', async () => {
        await writeFile(join(publicDir, 'index.html'), 'home');
        expect((await serveStaticFile('/')).toString()).toBe('home');
    });

    test('should serve nested paths', async () => {
        await mkdir(join(publicDir, 'assets'));
        await writeFile(join(publicDir, 'assets', 'app.js'), 'js');
        expect((await serveStaticFile('/assets/app.js')).toString()).toBe('js');
    });

    test('should strip query strings and fragments from the url', async () => {
        await writeFile(join(publicDir, 'query.txt'), 'q');
        const content = await serveStaticFile('/query.txt?x=1#frag');
        expect(content.toString()).toBe('q');
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
        const content = await serveStaticFile('/empty.txt');
        expect(content.length).toBe(0);
    });

    test('should read a file larger than one chunk', async () => {
        const content = 'x'.repeat(200_000);
        await writeFile(join(publicDir, 'large.txt'), content);
        expect((await serveStaticFile('/large.txt')).toString()).toBe(content);
    });
});

describe('serveFile.open()', () => {
    test('should return a read-only FileHandle for a direct path', async () => {
        const p = join(publicDir, 'hello.txt');
        const handle = await open(p);
        expect(handle).toBeInstanceOf(FileHandle);
        expect(handle.flag).toBe('r');
        await handle.close();
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
