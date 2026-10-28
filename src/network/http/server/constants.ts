import {CRLF} from "../../common/constants.js";

export const MAX_REQUEST_COUNT = 1000;
export const HEADER_TERMINATOR = Buffer.concat([CRLF, CRLF]);