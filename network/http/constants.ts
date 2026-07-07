export const MAX_HEADER_COUNT           = 100;
export const MAX_HEADER_NAME_LENGTH     = 100;
export const MAX_HEADER_VALUE_LENGTH    = 8000;
export const MAX_HEADER_LENGTH = 8 * 1024;

export const HEADER_NAME_REGEX = /^[-a-zA-Z0-9!#$%&'*+.^_`|~]+$/;
export const HEADER_VALUE_REGEX = /^[\x09\x20\x21-\x7E\x80-\xFF]*$/;

export const MANDATORY_HEADERS = ['host'] as const;
export const SUPPORTED_VERSIONS = ['HTTP/1.1'];

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