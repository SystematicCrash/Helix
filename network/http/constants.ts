export const MAX_HEADER_COUNT           = 100;
export const MAX_HEADER_NAME_LENGTH     = 100;
export const MAX_HEADER_VALUE_LENGTH    = 8000;
export const MAX_HEADER_LENGTH = 8 * 1024;

export const HEADER_NAME_REGEX = /^[-a-zA-Z0-9!#$%&'*+.^_`|~]+$/;
export const HEADER_VALUE_REGEX = /^[\x09\x20\x21-\x7E\x80-\xFF]*$/;

export const MANDATORY_HEADERS = ['host'];

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

