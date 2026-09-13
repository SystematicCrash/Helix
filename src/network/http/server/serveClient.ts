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

/** Handles one accepted connection: reads requests, dispatches them, and streams responses. */
export async function serveClient(conn: TCPConnection, info: ServerInfo): Promise<void> {
    const buf = new DynamicBuffer();
    // Scratch buffer for reading to minimize allocation churn
    const scratch = Buffer.allocUnsafe(16384);
    let request: HttpRequest | null = null;
    try {
        while (true) {
            if (!request) request = cutRequest(buf);

            if (!request) {
                const bytesRead = await conn.readInto(scratch);

                if (bytesRead === null) {
                    if (!buf.length) {
                        await conn.close(); // EOF
                        return;
                    }
                    throw new HttpError(400, 'Unexpected EOF');
                }

                buf.push(scratch.subarray(0, bytesRead));
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
        const response = mapErrorToResponse(error, request, info, 500);
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
