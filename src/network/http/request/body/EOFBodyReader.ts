import TCPConnection from "../../../tcp/conn/TCPConnection.js";
import DynamicBuffer from "../../../mem/DynamicBuffer.js";
import {BodyReader} from "../../common/types.js";

/**
 * Reads the body until the connection closes.
 * TODO: Implement reading the remainder of the connection.
 */
export default class EOFBodyReader implements BodyReader {
    public length = 0;

    constructor(_conn: TCPConnection, _buf: DynamicBuffer) {}

    async read(): Promise<Buffer | null> {
        return null;
    }
}
