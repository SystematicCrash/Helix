import HttpError from "../common/HttpError.js";
import {HEADER_TERMINATOR, MAX_HEADER_LENGTH} from "../common/constants.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import TCPConnection from "../../tcp/conn/TCPConnection.js";
import HttpRequest from "../request/HttpRequest.js";
import {handleRequest} from "../request/RequestRouter.js";
import {ResponseWriter} from "../response/ResponseWriter.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import {CRLF} from "../../common/constants.js";
import {ServerInfo} from "../../../server/ServerInfo.js";

/** Handles one accepted connection: reads requests, dispatches them, and streams responses. */
export async function serveClient(conn: TCPConnection, info: ServerInfo): Promise<void> {
    const buf = new DynamicBuffer();
    let request: HttpRequest | null = null;
    try {
        while (true) {
            if (!request) request = cutRequest(buf);

            if (!request) {
                const data = await conn.read();

                if (data === null) {
                    if (!buf.length) {
                        await conn.close(); // EOF
                        return;
                    }
                    throw HttpError.badRequest("Unexpected EOF", true);
                }

                buf.push(data);
                request = cutRequest(buf);
                if (!request) continue;
            }

            const body = request.getBody(conn, buf);
            const response = await handleRequest(request, body, info);
            await ResponseWriter.write(conn, response);

            // Drain the remaining body
            while (true) {
                const result = await body.read();
                if (result === null) break;
            }
            request = null;
        }
    } catch (error: unknown) {
        const response = mapErrorToResponse(error, request, info);
        await ResponseWriter.write(conn, response);
        await conn.close();
    }
}

/**
 * Scans the buffer for a complete HTTP header block (CRLF * 2) and returns a parsed request.
 * Throws HttpError(413) if the buffered header data exceeds the maximum allowed length.
 */
function cutRequest(buf: DynamicBuffer): HttpRequest {
    const idx = buf.getView(buf.length).indexOf(HEADER_TERMINATOR);

    if (idx < 0) {
        if (buf.length > MAX_HEADER_LENGTH) {
            throw HttpError.contentTooLarge('Headers too large');
        }
        throw HttpError.invalidHeaders();
    }

    const msg = HttpRequest.from(buf.getView(idx));
    buf.clear(idx + HEADER_TERMINATOR.length);
    return msg;
}
