import FsError from '../../../fs/common/FsError.js';
import BufferError from '../../../buffer/BufferError.js';
import TCPError from '../../tcp/common/TCPError.js';
import HttpError from './HttpError.js';
import {BUFFER_TO_HTTP_STATUS, FS_TO_HTTP_STATUS, TCP_TO_HTTP_STATUS} from "./constants.js";

/**
 * Maps a known underlying-layer error to an HttpError with the appropriate
 * status code. Returns `null` when the error is not a recognized
 * FsError / BufferError / TCPError.
 */
export function mapToHttpError(error: unknown): HttpError {
    if (error instanceof HttpError) {
        return error;
    }
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

    return HttpError.internalError();
}
