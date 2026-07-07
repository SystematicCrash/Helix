import HttpError from "./HttpError";
import DynamicBuffer from "../mem/DynamicBuffer";
import TCPConnection from "../tcp/TCPConnection";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import {handleRequest, parseRequest, getReader} from "./request";
import {writeResponse} from "./response";
import {MAX_HEADER_LENGTH} from "./constants";


export async function serveClient(conn: TCPConnection) {
    const buf = new DynamicBuffer();

    while (true) {
        const request: null|HttpRequest = cutMessage(buf);

        if (!request) {
            const data = await conn.read();

            if (data.length === 0 && buf.length === 0) return; // EOF
            if (data.length === 0) throw new HttpError(400, 'Unexpected EOF');

            buf.push(data);
            continue;
        }
        const body: BodyReader = getReader(conn, buf, request);
        const response: HttpResponse = await handleRequest(request, body);
        await writeResponse(conn, response);

        while ((await body.read()).length > 0);
    }
}

function cutMessage(buf: DynamicBuffer): null|HttpRequest {
    const idx = buf.cut(buf.length)
        .indexOf('\r\n\r\n');

    if (idx < 0) {
        if (buf.length >= MAX_HEADER_LENGTH) {
            throw new HttpError(413, 'Too long header');
        }
        return null;
    }
    const msg: HttpRequest = parseRequest(buf.cut(idx));
    buf.pop(idx + 4);
    return msg;
}