import HttpError from "../common/HttpError.js";
import {MAX_HEADER_LENGTH} from "../common/constants.js";
import DynamicBuffer from "../../mem/DynamicBuffer.js";
import TCPConnection from "../../tcp/conn/TCPConnection.js";
import HttpRequest from "../request/HttpRequest.js";
import {handleRequest} from "../request/RequestRouter.js";
import {ResponseWriter} from "../response/ResponseWriter.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import Delimiter from "../../common/constants.js";

/** Terminator marking the end of the header block: an empty line (CRLF CRLF). */
const HEADER_TERMINATOR = Delimiter.CRLF + Delimiter.CRLF;

/** Handles one accepted connection: reads requests, dispatches them, and streams responses. */
export async function serveClient(conn: TCPConnection): Promise<void> {
    const buf = new DynamicBuffer();
    try {
        while (true) {
            const request = cutMessage(buf);

            if (!request) {
                const data = await conn.read();

                if (!data) {
                    if (!buf.length) await conn.close(); // EOF
                    else throw new HttpError(400, 'Unexpected EOF');
                    break;
                }

                buf.push(data);
                continue;
            }

            const body = request.getBodyReader(conn, buf);
            const response = await handleRequest(request, body);
            await ResponseWriter.write(conn, response);

            while ((await body.read()) !== null);
        }
    } catch (error: unknown) {
        const response = mapErrorToResponse(error);
        await ResponseWriter.write(conn, response);
    }
}

/** Scans the buffer for a complete HTTP header block (CRLF * 2) and returns a parsed request. */
function cutMessage(buf: DynamicBuffer): HttpRequest | null {
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
