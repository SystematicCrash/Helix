import TCPConnection from "../../tcp/conn/TCPConnection.js";
import Delimiter from "../../common/constants.js";
import {HttpHeader, TransferEncoding} from "../common/constants.js";
import {BodyReader, HttpResponse} from "../common/types.js";
import {encodeHeaders} from "./encodeHeaders.js";

/*
 * Serializes and streams HTTP responses to a connection.
 * Picks fixed-length or chunked framing depending on the body length.
 */
export class ResponseWriter {
    /*
     * Writes the response header and streams the body to the connection.
     */
    static async write(conn: TCPConnection, response: HttpResponse): Promise<void> {
        if (response.body.length === -1) {
            response.headers.set(HttpHeader.TransferEncoding, TransferEncoding.CHUNKED);
        } else {
            response.headers.set(HttpHeader.ContentLength, response.body.length.toString());
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
            const data = await body.read();
            if (!data) break;
            await conn.write(data);
        }
    }

    /*
     * Streams a body using chunked transfer encoding.
     */
    private static async chunkedWriter(conn: TCPConnection, body: BodyReader): Promise<void> {
        while (true) {
            const data = await body.read();
            if (!data) break;

            const chunk = Buffer.from(
                data.length.toString(16) +
                Delimiter.CRLF +
                data +
                Delimiter.CRLF
            );

            await conn.write(chunk);
        }

        const chunk = Buffer.from(0 + Delimiter.CRLF + Delimiter.CRLF);
        await conn.write(chunk);
    }
}
