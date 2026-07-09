import HttpError from "./HttpError";
import DynamicBuffer from "../mem/DynamicBuffer";
import TCPConnection from "../tcp/TCPConnection";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import {handleRequest, parseRequest, getReader} from "./request";
import {mapErrorToResponse, writeResponse} from "./response";
import {MAX_HEADER_LENGTH} from "./constants";


/** Reads newline-delimited messages in a loop, dispatching each to replyMessage until the connection is closed. */
export async function serveClient(conn: TCPConnection) {
    const buf = new DynamicBuffer();
    try {
        while (true) {
            const request: null|HttpRequest = cutMessage(buf);

            if (!request) {
                const data = await conn.read();

                if (data.length === 0 && buf.length === 0) conn.socket.end(); // EOF
                if (data.length === 0) throw new HttpError(400, 'Unexpected EOF');

                buf.push(data);
                continue;
            }
            const body: BodyReader = getReader(conn, buf, request);
            const response: HttpResponse = await handleRequest(request, body);
            await writeResponse(conn, response);

            while ((await body.read()).length > 0);
        }
    } catch (error: unknown) {
        const response = mapErrorToResponse(error);
        await writeResponse(conn, response);
    }

}

/** Scans the buffer for a complete HTTP header block (CRLFCRLF) and returns a parsed request. */
function cutMessage(buf: DynamicBuffer): null|HttpRequest {
    const idx = buf.cut(buf.length)
        .indexOf('\r\n\r\n');

    if (idx < 0) {
        if (buf.length > MAX_HEADER_LENGTH) {
            throw new HttpError(413, 'Too long header');
        }
        return null;
    }
    const msg: HttpRequest = parseRequest(buf.cut(idx));
    buf.pop(idx + 4);
    return msg;
}