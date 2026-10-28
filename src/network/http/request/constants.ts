import {HttpHeader, HttpVersion} from "../common/constants.js";

export const MAX_HEADER_COUNT           = 100;
export const MAX_HEADER_NAME_LENGTH     = 100;
export const MAX_HEADER_VALUE_LENGTH    = 8000;
export const MAX_HEADER_LENGTH = 8 * 1024;
export const MAX_REQUEST_LINE_LENGTH    = 8000;
export const MAX_CHUNK_SIZE = 64 * 1024;
export const MAX_RANGES_LIMIT = 10;

export const HEADER_NAME_REGEX = /^[-a-zA-Z0-9!#$%&'*+.^_`|~]+$/;
export const HEADER_VALUE_REGEX = /^[\x09\x20\x21-\x7E\x80-\xFF]+$/;

/** RFC 7230 §4.1.1 — chunk-size grammar: 1*HEXDIG */
export const HEX_DIGITS = /^[0-9A-Fa-f]+$/;
export const DEC_DIGITS = /^\d+$/;

export const VALID_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'HEAD',
    'GET'
]);

export const MANDATORY_HEADERS = [HttpHeader.Host] as const;
export const UNIQUE_HEADERS = [HttpHeader.Host, HttpHeader.ContentLength, HttpHeader.TransferEncoding];
export const SUPPORTED_VERSIONS = [HttpVersion.HTTP_1_1];