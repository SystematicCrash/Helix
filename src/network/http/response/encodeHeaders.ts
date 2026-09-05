import {HTTP_STATUS} from "../common/constants.js";
import {HttpResponse} from "../common/types.js";

/** Serializes the response status line and header into a buffer. */
export function encodeHeaders(response: HttpResponse): Buffer {
    const parts: string[] = [];
    parts.push(`${response.version} ${response.code} ${HTTP_STATUS[response.code]}`);

    for (const header of response.headers) {
        parts.push(`${header[0]}: ${header[1]}`);
    }

    parts.push('\r\n');
    return Buffer.from(parts.join("\r\n"));
}
