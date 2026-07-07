import {HttpResponse} from "./types";
import TCPConnection from "../tcp/TCPConnection";
import HttpError from "./HttpError";
import {HTTP_STATUS, HttpHeader} from "./constants";


export async function writeResponse(conn: TCPConnection, response: HttpResponse): Promise<void> {
    if (response.body.length < 0) {
        throw new Error("Chunked encoding not implemented.");
    }

    response.headers.set(HttpHeader.ContentLength, response.body.length.toString());
    await conn.write(encodeResponse(response));

    while (true) {
        const data = await response.body.read();
        if (data.length === 0) break;
        await conn.write(data);
    }
}

function encodeResponse(response: HttpResponse): Buffer {
    const parts: string[] = [];
    parts.push(`${response.version} ${response.code} ${HTTP_STATUS[response.code]}`);

    for (const header of response.headers) {
        parts.push(`${header[0]}: ${header[1]}`);
    }

    parts.push('\r\n');
    return Buffer.from(parts.join("\r\n"));
}
