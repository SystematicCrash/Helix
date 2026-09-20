import { describe, expect, test } from 'vitest';
import { mapToHttpError } from '../../../../../src/network/http/common/mappers.js';
import FsError from '../../../../../src/fs/common/FsError.js';
import { FsErrCode } from '../../../../../src/fs/common/constants.js';
import BufferError from '../../../../../src/buffer/BufferError.js';
import { BufferErrCode } from '../../../../../src/buffer/constants.js';
import TCPError from '../../../../../src/network/tcp/common/TCPError.js';
import { TCPErrCode } from '../../../../../src/network/tcp/common/constants.js';
import HttpError from '../../../../../src/network/http/common/HttpError.js';

describe('mapUnderlayingErrorToHttp()', () => {

    describe('FsError', () => {
        test('maps NOT_FOUND to 404', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.NOT_FOUND));
            expect(err).toBeInstanceOf(HttpError);
            expect(err?.status).toBe(404);
        });

        test('maps PERMISSION_DENIED to 403', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.PERMISSION_DENIED));
            expect(err?.status).toBe(403);
        });

        test('maps ALREADY_EXISTS to 409', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.ALREADY_EXISTS));
            expect(err?.status).toBe(409);
        });

        test('maps SYMLINK_NOT_ALLOWED to 403', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.SYMLINK_NOT_ALLOWED));
            expect(err?.status).toBe(403);
        });

        test('maps PATH_OUTSIDE_ROOT to 403', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.PATH_OUTSIDE_ROOT));
            expect(err?.status).toBe(403);
        });

        test('maps OUT_OF_SPACE to 507', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.OUT_OF_SPACE));
            expect(err?.status).toBe(507);
        });

        test('maps READ_FAILED to 500', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.READ_FAILED));
            expect(err?.status).toBe(500);
        });

        test('maps INVALID_PATH to 400', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.INVALID_PATH));
            expect(err?.status).toBe(400);
        });

        test('marks FsError as fatal', () => {
            const err = mapToHttpError(FsError.from(FsErrCode.NOT_FOUND));
            expect(err?.fatal).toBe(true);
        });
    });

    describe('BufferError', () => {
        test('maps MAX_SIZE_EXCEEDED to 413', () => {
            const err = mapToHttpError(BufferError.from(BufferErrCode.MAX_SIZE_EXCEEDED));
            expect(err?.status).toBe(413);
        });

        test('maps VIEW_EXCEEDED to 500', () => {
            const err = mapToHttpError(BufferError.from(BufferErrCode.VIEW_EXCEEDED));
            expect(err?.status).toBe(500);
        });

        test('maps CLEAR_EXCEEDED to 500', () => {
            const err = mapToHttpError(BufferError.from(BufferErrCode.CLEAR_EXCEEDED));
            expect(err?.status).toBe(500);
        });

        test('marks BufferError as fatal', () => {
            const err = mapToHttpError(BufferError.from(BufferErrCode.MAX_SIZE_EXCEEDED));
            expect(err?.fatal).toBe(true);
        });
    });

    describe('TCPError', () => {
        test('maps IDLE_TIMEOUT to 408', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.IDLE_TIMEOUT));
            expect(err?.status).toBe(408);
        });

        test('maps WRITE_TIMEOUT to 504', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.WRITE_TIMEOUT));
            expect(err?.status).toBe(504);
        });

        test('maps READ_TIMEOUT to 504', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.READ_TIMEOUT));
            expect(err?.status).toBe(504);
        });

        test('maps WRITE_BACKPRESSURE to 503', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.WRITE_BACKPRESSURE));
            expect(err?.status).toBe(503);
        });

        test('maps MAXIMUM_CONNECTIONS_EXCEEDED to 503', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.MAXIMUM_CONNECTIONS_EXCEEDED));
            expect(err?.status).toBe(503);
        });

        test('maps READ_AFTER_CLOSE to 400', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.READ_AFTER_CLOSE));
            expect(err?.status).toBe(400);
        });

        test('marks TCPError as fatal', () => {
            const err = mapToHttpError(TCPError.from(TCPErrCode.IDLE_TIMEOUT));
            expect(err?.fatal).toBe(true);
        });
    });

    describe('unknown errors', () => {
        test('returns null for plain Error', () => {
            expect(mapToHttpError(new Error('unknown'))).toBeNull();
        });

        test('returns null for string', () => {
            expect(mapToHttpError('something')).toBeNull();
        });

        test('returns null for null', () => {
            expect(mapToHttpError(null)).toBeNull();
        });
    });
});
