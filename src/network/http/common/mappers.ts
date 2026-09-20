import {FsErrCode} from '../../../fs';
import {BufferErrCode} from '../../../buffer/constants.js';
import {TCPErrCode} from '../../tcp';
import FsError from '../../../fs/common/FsError.js';
import BufferError from '../../../buffer/BufferError.js';
import TCPError from '../../tcp/common/TCPError.js';
import HttpError from './HttpError.js';

const FS_TO_HTTP_STATUS: Record<FsErrCode, number> = {
    [FsErrCode.NOT_FOUND]:             404,
    [FsErrCode.PERMISSION_DENIED]:     403,
    [FsErrCode.IS_DIRECTORY]:          400,
    [FsErrCode.NOT_DIRECTORY]:         400,
    [FsErrCode.ALREADY_EXISTS]:        409,
    [FsErrCode.READ_FAILED]:           500,
    [FsErrCode.OPEN_FAILED]:           500,
    [FsErrCode.CLOSE_FAILED]:          500,
    [FsErrCode.SEEK_FAILED]:           500,
    [FsErrCode.STAT_FAILED]:           500,
    [FsErrCode.PATH_TOO_LONG]:         400,
    [FsErrCode.INVALID_PATH]:          400,
    [FsErrCode.INVALID_ARGUMENT]:      400,
    [FsErrCode.OUT_OF_SPACE]:          507,
    [FsErrCode.SYMLINK_NOT_ALLOWED]:   403,
    [FsErrCode.PATH_OUTSIDE_ROOT]:     403,
    [FsErrCode.UNEXPECTED_ERROR]:      500,
};

const BUFFER_TO_HTTP_STATUS: Record<BufferErrCode, number> = {
    [BufferErrCode.MAX_SIZE_EXCEEDED]: 413,
    [BufferErrCode.VIEW_EXCEEDED]:     500,
    [BufferErrCode.CLEAR_EXCEEDED]:    500,
};

const TCP_TO_HTTP_STATUS: Record<TCPErrCode, number> = {
    [TCPErrCode.READ_AFTER_EOF]:            400,
    [TCPErrCode.WRITE_AFTER_EOF]:           400,
    [TCPErrCode.READ_AFTER_CLOSE]:          400,
    [TCPErrCode.WRITE_AFTER_CLOSE]:         400,
    [TCPErrCode.WRITE_BACKPRESSURE]:        503,
    [TCPErrCode.EMPTY_DATA_BUFFER]:         400,
    [TCPErrCode.SIMULTANEOUS_READ]:         500,
    [TCPErrCode.SIMULTANEOUS_WRITE]:        500,
    [TCPErrCode.IDLE_TIMEOUT]:              408,
    [TCPErrCode.WRITE_TIMEOUT]:             504,
    [TCPErrCode.READ_TIMEOUT]:              504,
    [TCPErrCode.UNKNOWN_TIMEOUT]:           500,
    [TCPErrCode.UNEXPECTED_ERROR]:          500,
    [TCPErrCode.FORCED_CLOSE]:              503,
    [TCPErrCode.CLOSED_WHILE_WRITE]:        503,
    [TCPErrCode.MAXIMUM_CONNECTIONS_EXCEEDED]: 503,
};

/**
 * Maps a known underlying-layer error to an HttpError with the appropriate
 * status code. Returns `null` when the error is not a recognized
 * FsError / BufferError / TCPError.
 */
export function mapToHttpError(error: unknown): HttpError | null {
    if (error instanceof FsError) {
        const status = FS_TO_HTTP_STATUS[error.code] ?? 500;
        return new HttpError(status, error.message, true);
    }
    if (error instanceof BufferError) {
        const status = BUFFER_TO_HTTP_STATUS[error.code] ?? 500;
        return new HttpError(status, error.message, true);
    }
    if (error instanceof TCPError) {
        const status = TCP_TO_HTTP_STATUS[error.code] ?? 500;
        return new HttpError(status, error.message, true);
    }
    if (error instanceof Error) {
        return new HttpError(500, 'Internal Server Error', true);
    }

    return null;
}
