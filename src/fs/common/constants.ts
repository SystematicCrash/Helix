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
