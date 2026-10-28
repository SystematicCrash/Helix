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
    AcceptRange       = 'accept-range',
    Authorization     = 'authorization',
    ContentType       = 'content-type',
    ContentLength     = 'content-length',
    ContentRange      = 'content-range',
    Cookie            = 'cookie',
    Origin            = 'origin',
    Referer           = 'referer',
    UserAgent         = 'user-agent',
    IfNoneMatch       = 'if-none-match',
    IfModifiedSince   = 'if-modified-since',
    IfRange            = 'if-range',
    Range             = 'range',

    // Response
    SetCookie         = 'set-cookie',
    Location          = 'location',
    Date              = 'Date',
    ETag              = 'etag',
    LastModified      = 'last-modified',
    ContentEncoding   = 'content-encoding',
    WWWAuthenticate   = 'www-authenticate',
    Allow             = 'allow',
    RetryAfter        = 'retry-after',
}

export enum ContentType {
    // Application
    Json = 'application/json',
    JsonUtf8 = 'application/json; charset=utf-8',
    OctetStream = 'application/octet-stream',
    FormUrlEncoded = 'application/x-www-form-urlencoded',
    Pdf = 'application/pdf',
    Xml = 'application/xml',
    Zip = 'application/zip',
    Gzip = 'application/gzip',

    // Text
    TextPlain = 'text/plain',
    TextPlainUtf8 = 'text/plain; charset=utf-8',
    TextHtml = 'text/html',
    TextHtmlUtf8 = 'text/html; charset=utf-8',
    TextCss = 'text/css',
    TextJavascript = 'text/javascript',
    TextCsv = 'text/csv',
    TextEventStream = 'text/event-stream',

    // Multipart
    MultipartFormData = 'multipart/form-data',
    MultipartByteRanges = 'multipart/byteranges',

    // Images
    ImagePng = 'image/png',
    ImageJpeg = 'image/jpeg',
    ImageGif = 'image/gif',
    ImageWebp = 'image/webp',
    ImageSvg = 'image/svg+xml',
    ImageIcon = 'image/x-icon',

    // Audio & Video
    AudioMpeg = 'audio/mpeg',
    AudioOgg = 'audio/ogg',
    VideoMp4 = 'video/mp4',
    VideoWebm = 'video/webm',
}

export enum HttpMethod {
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
    OPTIONS = 'OPTIONS',
    HEAD = 'HEAD',
    GET = 'GET',
    ANY = 'ANY',
}