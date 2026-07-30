import DynamicBuffer from "../../mem/DynamicBuffer.js";
import TCPConnection from "../conn/TCPConnection.js";

/**
 * TODO: This is just a toy and should be removed from the main product
 * Reads newline-delimited messages in a loop, dispatching each to replyMessage
 * until the connection is closed.
 */
export async function serveClient(conn: TCPConnection): Promise<void> {
    const buf = new DynamicBuffer(Buffer.alloc(0));

    while (true) {
        const msg: Buffer|null = buf.popMessage();

        if (!msg) {
            try {
                const data = await conn.read();
                buf.push(data);
                continue;
            } catch (err) {
                break;
            }
        }

        await replyMessage(conn, msg);
    }
}

/**
 * TODO: This is just a toy demo and should be removed from the main product
 * Parses a single framed message and writes the appropriate response.
 * Destroys the conn on a quit command.
 */
async function replyMessage(conn: TCPConnection, msg: Buffer): Promise<void> {
    const str = msg.toString();

    if (str === 'quit\n') {
        await conn.write(Buffer.from('Bye!'));
        conn.close();
    } else {
        await conn.write(Buffer.from(`Echo: ${str}`));
    }
}
