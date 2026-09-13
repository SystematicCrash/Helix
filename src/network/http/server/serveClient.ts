import HttpError from "../common/HttpError.js";
import {MAX_HEADER_LENGTH} from "../common/constants.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import TCPConnection from "../../tcp/conn/TCPConnection.js";
import HttpRequest from "../request/HttpRequest.js";
import {handleRequest} from "../request/RequestRouter.js";
import {ResponseWriter} from "../response/ResponseWriter.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import {CRLF} from "../../common/constants.js";
import {ServerInfo} from "../../../server/ServerInfo.js";

/** Terminator marking the end of the header block: an empty line (CRLF CRLF). */
const HEADER_TERMINATOR = Buffer.concat([CRLF, CRLF]);

/** Stand-in used by the error path when no request has been parsed yet. */
const PLACEHOLDER_REQUEST: HttpRequest = {
    method: 'UNKNOWN',
    url: '',
    version: 'HTTP/1.1',
    headers: new Map(),
};

/** Handles one accepted connection: reads requests, dispatches them, and streams responses. */
export async function serveClient(conn: TCPConnection, info: ServerInfo): Promise<void> {
    const buf = new DynamicBuffer();
    let request: HttpRequest | null = null;
    try {
        while (true) {
            if (!request) request = cutRequest(buf);

            if (!request) {
                const data = await conn.read();

                if (!data) {
                    if (!buf.length) {
                        await conn.close(); // EOF
                        return;
                    }
                    throw new HttpError(400, 'Unexpected EOF');
                }

                buf.push(data);
                request = cutRequest(buf);
                if (!request) continue;
            }

            const body = request.getBodyReader(conn, buf);
            const response = await handleRequest(request, body, info);
            await ResponseWriter.write(conn, response);

            while ((await body.read()) !== null);
            request = null;
        }
    } catch (error: unknown) {
        const response = mapErrorToResponse(error, request ?? PLACEHOLDER_REQUEST, info);
        await ResponseWriter.write(conn, response);
        await conn.close();
    }
}

/**
 * Scans the buffer for a complete HTTP header block (CRLF * 2) and returns a parsed request.
 * Throws HttpError(413) if the buffered header data exceeds the maximum allowed length.
 */
function cutRequest(buf: DynamicBuffer): HttpRequest | null {
    const idx = buf.getView(buf.length).indexOf(HEADER_TERMINATOR);

    if (idx < 0) {
        if (buf.length > MAX_HEADER_LENGTH) {
            throw new HttpError(413, 'Too long header');
        }
        return null;
    }

    const msg = HttpRequest.from(buf.getView(idx));
    buf.clear(idx + HEADER_TERMINATOR.length);
    return msg;
}
