import {FsErrCode} from "../../../fs/index.js";
import {BufferErrCode} from "../../../buffer/constants.js";
import {TCPErrCode} from "../../tcp/index.js";

export const HTTP_STATUS: Record<number, string> = {
    // 1xx Informational
    100: 'Continue',
    101: 'Switching Protocols',
    102: 'Processing',
    103: 'Early Hints',

    // 2xx Success
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    203: 'Non-Authoritative Information',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    207: 'Multi-Status',
    208: 'Already Reported',
    226: 'IM Used',

    // 3xx Redirection
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    305: 'Use Proxy',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',

    // 4xx Client Error
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Content Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    418: "I'm a Teapot",
    421: 'Misdirected Request',
    422: 'Unprocessable Content',
    423: 'Locked',
    424: 'Failed Dependency',
    425: 'Too Early',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',

    // 5xx Server Error
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates',
    507: 'Insufficient Storage',
    508: 'Loop Detected',
    510: 'Not Extended',
    511: 'Network Authentication Required',
} as const;

export const FS_TO_HTTP_STATUS: Record<FsErrCode, number> = {
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

export const BUFFER_TO_HTTP_STATUS: Record<BufferErrCode, number> = {
    [BufferErrCode.MAX_SIZE_EXCEEDED]: 413,
    [BufferErrCode.VIEW_EXCEEDED]:     500,
    [BufferErrCode.CLEAR_EXCEEDED]:    500,
};

export const TCP_TO_HTTP_STATUS: Record<TCPErrCode, number> = {
    [TCPErrCode.READ_AFTER_EOF]:            500,
    [TCPErrCode.WRITE_AFTER_EOF]:           500,
    [TCPErrCode.READ_AFTER_CLOSE]:          500,
    [TCPErrCode.WRITE_AFTER_CLOSE]:         500,
    [TCPErrCode.WRITE_BACKPRESSURE]:        503,
    [TCPErrCode.EMPTY_DATA_BUFFER]:         500,
    [TCPErrCode.SIMULTANEOUS_READ]:         500,
    [TCPErrCode.SIMULTANEOUS_WRITE]:        500,
    [TCPErrCode.IDLE_TIMEOUT]:              408,
    [TCPErrCode.READ_TIMEOUT]:              408,
    [TCPErrCode.WRITE_TIMEOUT]:             500,
    [TCPErrCode.UNKNOWN_TIMEOUT]:           500,
    [TCPErrCode.UNEXPECTED_ERROR]:          500,
    [TCPErrCode.FORCED_CLOSE]:              500,
    [TCPErrCode.CLOSED_WHILE_WRITE]:        500,
    [TCPErrCode.MAXIMUM_CONNECTIONS_EXCEEDED]: 503,
};