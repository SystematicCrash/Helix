import TCPConnection from "../../tcp/conn/TCPConnection.js";
import {CRLF} from "../../common/constants.js";
import {HttpHeader, TransferEncoding} from "../common/constants.js";
import {HttpResponse} from "../common/types.js";
import {encodeHeaders} from "./encodeHeaders.js";
import {BodyReader} from "../request/body/BodyReader.js";

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
        if (response.body.length !== -1) {
            response.headers.set(HttpHeader.ContentLength, response.body.length.toString());
        } else {
            response.headers.set(HttpHeader.TransferEncoding, TransferEncoding.CHUNKED);
        }
        await conn.write(encodeHeaders(response));

        if (response.headers.get(HttpHeader.TransferEncoding) === TransferEncoding.CHUNKED) {
            await this.chunkedWriter(conn, response.body);
        } else {
            await this.fixedWriter(conn, response.body);
        }
        await conn.flush();
    }

    /*
     * Streams a body of known length by writing each read chunk directly.
     */
    private static async fixedWriter(conn: TCPConnection, body: BodyReader): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
            await conn.write(chunk);
        }
    }

    /*
     * Streams a body using chunked transfer encoding.
     */
    private static async chunkedWriter(conn: TCPConnection, body: BodyReader): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;

            const framed = Buffer.concat([
                Buffer.from(chunk.length.toString(16)),
                CRLF,
                chunk,
                CRLF,
            ]);

            await conn.write(framed);
        }

        const terminator = Buffer.concat([Buffer.from('0'), CRLF, CRLF]);
        await conn.write(terminator);
    }
}
