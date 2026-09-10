export const DEFAULT_READ_LENGTH = 64 * 1024;
export const DEFAULT_READ_CHUNK_SIZE = 64 * 1024;

export enum FsErrCode {
    NOT_FOUND = 'File or directory not found',
    PERMISSION_DENIED = 'Permission denied for the filesystem operation',
    IS_DIRECTORY = 'Target is a directory, not a file',
    NOT_DIRECTORY = 'Parent path is not a directory',
    ALREADY_EXISTS = 'File or directory already exists',
    READ_FAILED = 'Reading from the filesystem failed',
    OPEN_FAILED = 'Opening the file failed',
    CLOSE_FAILED = 'Closing the file failed',
    SEEK_FAILED = 'Changing the file position failed',
    STAT_FAILED = 'Querying file metadata failed',
    PATH_TOO_LONG = 'Path exceeds the maximum allowed length',
    INVALID_PATH = 'Path is malformed or empty',
    INVALID_ARGUMENT = 'Invalid argument passed to a filesystem operation',
    OUT_OF_SPACE = 'No space left on the device',
    UNEXPECTED_ERROR = 'Unexpected filesystem error occurred',
}

/** Handle operations usable after open; used for closed-handle error messages. */
export enum FsOperation {
    READ = 'read',
    STAT = 'stat',
}

/** Maps node errno codes to FsErrCode; unknown codes fall back to `fallback`. */
export function errnoToFsErrCode(errno: string | undefined, fallback: FsErrCode): FsErrCode {
    switch (errno) {
        case 'ENOENT': return FsErrCode.NOT_FOUND;
        case 'EACCES':
        case 'EPERM':  return FsErrCode.PERMISSION_DENIED;
        case 'EISDIR': return FsErrCode.IS_DIRECTORY;
        case 'ENOTDIR': return FsErrCode.NOT_DIRECTORY;
        case 'EEXIST': return FsErrCode.ALREADY_EXISTS;
        case 'ENAMETOOLONG': return FsErrCode.PATH_TOO_LONG;
        case 'ENOSPC': return FsErrCode.OUT_OF_SPACE;
        default: return fallback;
    }
}
