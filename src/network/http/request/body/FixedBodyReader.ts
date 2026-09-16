import DynamicBuffer from "../../../../buffer/DynamicBuffer.js";
import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import {BodyReader} from "./BodyReader.js";

/** Reads exactly `length` bytes from the connection, consuming buffered data first. */
export default class FixedBodyReader extends BodyReader {
    constructor(
        private readonly conn: TCPConnection,
        private readonly buf: DynamicBuffer,
        remain: number,
    ) {
        super();
        this.length = remain;
        this.checkMaxSize();
    }

    protected async pullBytes(): Promise<Buffer | null> {
        if (this.readBytes === this.length) return null; // EOF

        if (this.buf.length === 0) {
            const data = await this.conn.read();
            if (data === null) {
                throw new Error('Unexpected EOF while reading request body');
            }
            this.buf.push(data);
        }

        const consume = Math.min(this.buf.length, this.length - this.readBytes);
        return this.buf.pop(consume);
    }
}
