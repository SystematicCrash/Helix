import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import {BodyReaderAbs} from "./BodyReaderAbs.js";

/** Reads exactly `length` bytes from the connection, consuming buffered data first. */
export default class FixedBodyReader extends BodyReaderAbs {

    constructor(
        private readonly conn: TCPConnection,
        private readonly buf: DynamicBuffer,
        remain: number,
    ) {
        super();
        this.length = remain;
        this.checkMaxSize();
    }

    async read(): Promise<Buffer | null> {
        if (this.length === 0) return null; // EOF

        if (this.buf.length === 0) {
            const data = await this.conn.read();
            if (data === null) {
                throw new Error('Unexpected EOF while reading request body');
            }
            this.buf.push(data);
        }

        const consume = Math.min(this.buf.length, this.length);
        this.length -= consume;
        return this.buf.pop(consume);
    }
}
