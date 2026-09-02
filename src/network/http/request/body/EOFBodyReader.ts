import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import {BodyReader} from "../../common/types.js";

/**
 * Reads the message body until the connection closes.
 *
 * Used when neither Content-Length nor Transfer-Encoding is present — the body
 * length is delimited by the server closing the connection (RFC 7230 §3.3.3).
 *
 * `length` stays at -1 because the body length is unknown up front.
 * `read()` returns every byte the connection provides, then returns `null`
 * once the peer closes the connection.
 */
export default class EOFBodyReader implements BodyReader {
    public length = -1;
    private finished = false;

    constructor(
        private readonly conn: TCPConnection,
        private readonly buf: DynamicBuffer,
    ) {}

    async read(): Promise<Buffer | null> {
        if (this.finished) return null;

        if (this.buf.length === 0) {
            const data = await this.conn.read();
            if (data === null) {
                this.finished = true;
                return null;
            }
            this.buf.push(data);
        }

        const view = this.buf.getView();
        const data = Buffer.from(view);
        this.buf.clear();
        return data;
    }
}
