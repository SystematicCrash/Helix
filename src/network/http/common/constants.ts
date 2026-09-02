export const MAX_HEADER_COUNT           = 100;
export const MAX_HEADER_NAME_LENGTH     = 100;
export const MAX_HEADER_VALUE_LENGTH    = 8000;
export const MAX_HEADER_LENGTH = 8 * 1024;
export const MAX_CHUNK_SIZE = 64 * 1024 * 1000;

export const HEADER_NAME_REGEX = /^[-a-zA-Z0-9!#$%&'*+.^_`|~]+$/;
export const HEADER_VALUE_REGEX = /^[\x09\x20\x21-\x7E\x80-\xFF]*$/;

/** RFC 7230 §4.1.1 — chunk-size grammar: 1*HEXDIG */
export const HEX_DIGITS = /^[0-9A-Fa-f]+$/;

/**
 * RFC 7230 token-char set as a numeric code lookup. Use with `String.charCodeAt(i)`
 * to avoid `noUncheckedIndexedAccess`-induced undefined values when indexing a string.
 */
export const TOKEN_CHAR_CODES: ReadonlySet<number> = new Set<number>([
    0x21, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2A, 0x2B, // !#$%&'*+
    0x2D, 0x2E,                                       // -.
    0x30, 0x31, 0x32, 0x33, 0x34,                     // 0-4
    0x35, 0x36, 0x37, 0x38, 0x39,                     // 5-9
    0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47,         // A-G
    0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F,   // H-O
    0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57,   // P-W
    0x58, 0x59, 0x5A,                                 // X-Z
    0x5E, 0x5F, 0x60,                                 // ^_`
    0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67,         // a-g
    0x68, 0x69, 0x6A, 0x6B, 0x6C, 0x6D, 0x6E, 0x6F,   // h-o
    0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77,   // p-w
    0x78, 0x79, 0x7A,                                 // x-z
    0x7C, 0x7E,                                       // |~
]);

export const MANDATORY_HEADERS = ['host'] as const;
export const SUPPORTED_VERSIONS = ['HTTP/1.1'];

export enum TransferEncoding {
    CHUNKED = 'chunked',
}

export enum HttpVersion {
    HTTP_1_0 = 'HTTP/1.0',
    HTTP_1_1 = 'HTTP/1.1',
    HTTP_2 = 'HTTP/2',
    HTTP_3 = 'HTTP/3',
}

export enum HttpHeader {
    // General
    Connection        = 'connection',
    CacheControl      = 'cache-control',
    TransferEncoding  = 'transfer-encoding',

    // Request
    Host              = 'host',
    Accept            = 'accept',
    AcceptEncoding    = 'accept-encoding',
    AcceptLanguage    = 'accept-language',
    Authorization     = 'authorization',
    ContentType       = 'content-type',
    ContentLength     = 'content-length',
    Cookie            = 'cookie',
    Origin            = 'origin',
    Referer           = 'referer',
    UserAgent         = 'user-agent',
    IfNoneMatch       = 'if-none-match',
    IfModifiedSince   = 'if-modified-since',
    Range             = 'range',

    // Response
    SetCookie         = 'set-cookie',
    Location          = 'location',
    ETag              = 'etag',
    LastModified      = 'last-modified',
    ContentEncoding   = 'content-encoding',
    WWWAuthenticate   = 'www-authenticate',
    Allow             = 'allow',
    RetryAfter        = 'retry-after',
}

export enum HttpMethod {
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
    OPTIONS = 'OPTIONS',
    HEAD = 'HEAD',
    GET = 'GET',
}

export const VALID_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'HEAD',
    'GET'
]);

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
