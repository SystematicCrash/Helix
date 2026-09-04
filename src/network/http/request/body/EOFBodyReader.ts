import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import {BodyReaderAbs} from "./BodyReaderAbs.js";

/**
 * Reads the message body until the connection closes.
 *
 * Used when neither Content-Length nor Transfer-Encoding is present — the body
 * length is delimited by the server closing the connection (RFC 7230 §3.3.3).
 *
 * `read()` returns every byte the connection provides, then returns `null`
 * once the peer closes the connection.
 */
export default class EOFBodyReader extends BodyReaderAbs {
    private finished = false;

    constructor(
        private readonly conn: TCPConnection,
        private readonly buf: DynamicBuffer,
    ) {
        super();
    }

    async read(): Promise<Buffer | null> {
        if (this.finished) return null;
        this.checkMaxSize();

        if (this.buf.length === 0) {
            const data = await this.conn.read();
            if (data === null) {
                this.finished = true;
                return null;
            }
            this.buf.push(data);
            this.length += data.length;
        }

        return this.buf.pop();
    }
}
