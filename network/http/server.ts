import HttpError from "./HttpError";
import DynamicBuffer from "../mem/DynamicBuffer";
import TCPConnection from "../tcp/TCPConnection";
import {BodyReader, HttpRequest, HttpResponse} from "./types";
import {handleRequest, parseHttpRequest, readerFromRequest} from "./request";
import {writeHttpResponse} from "./response";
import {MAX_HEADER_LENGTH} from "./constants";


export async function serveClient(conn: TCPConnection) {
    const buf = new DynamicBuffer();

    while(true) {
        const msg: null|HttpRequest = cutMessage(buf);

        if (!msg) {
            const data = await conn.read();
            buf.push(data);

            if (data.length === 0 && buf.length) return; // EOF

            if (data.length === 0) {
                throw new HttpError(400, 'Unexpected EOF');
            }
            continue;
        }
        const body: BodyReader = readerFromRequest(conn, buf, msg);
        const response: HttpResponse = await handleRequest(msg, body);
        await writeHttpResponse(conn, response);

        if (msg.version.toString() === '1.0') return; // HTTP/1.0 is not supported

        while ((await body.read()).length > 0);
    }
}

function cutMessage(buf: DynamicBuffer): null|HttpRequest {
    const idx = buf.data.subarray(0, buf.length)
        .indexOf('\r\n\r\n');

    if (idx < 0) {
        if (buf.length >= MAX_HEADER_LENGTH) {
            throw new HttpError(413, 'Too long header');
        }
        return null;
    }
    const msg: HttpRequest = parseHttpRequest(buf.data.subarray(0, idx + 4));
    buf.pop(idx + 4);
    return msg;
}