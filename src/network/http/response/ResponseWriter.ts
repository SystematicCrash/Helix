import TCPConnection from "../../tcp/conn/TCPConnection.js";
import {HttpHeader, TransferEncoding} from "../common/constants.js";
import type HttpResponse from "./HttpResponse.js";
import {encodeHeaders} from "./encoder/encodeHeaders.js";
import {HttpBody} from "../body/HttpBody.js";
import {encodeChunk} from "./encoder/encodeChunk.js";

/*
 * Serializes and streams HTTP responses to a connection.
 * Picks fixed-length or chunked framing based on the body's known length
 * (`length !== -1` ⇒ fixed, `length === -1` ⇒ chunked).
 */
export class ResponseWriter {
    /*
     * Writes the response header and streams the body to the connection.
     */
    static async write(conn: TCPConnection, response: HttpResponse): Promise<void> {
        await conn.write(encodeHeaders(response));

        if (response.getHeader(HttpHeader.TransferEncoding) === TransferEncoding.CHUNKED) {
            await this.chunkedWriter(conn, response.body);
        } else {
            await this.fixedWriter(conn, response.body);
        }
        await conn.flush();
    }

    /*
     * Streams a body of known length by writing each read chunk directly.
     */
    private static async fixedWriter(conn: TCPConnection, body: HttpBody): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
            await conn.write(chunk);
        }
    }

    /*
     * Streams a body using chunked transfer encoding.
     */
    private static async chunkedWriter(conn: TCPConnection, body: HttpBody): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
            await conn.write(encodeChunk(chunk));
        }

        await conn.write(encodeChunk(Buffer.alloc(0)));
    }
}
