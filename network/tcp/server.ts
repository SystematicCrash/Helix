import DynamicBuffer from "../mem/DynamicBuffer";
import TCPConnection from "./TCPConnection";

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
            const data = await conn.read();
            if (data.length === 0) break;
            buf.push(data);
            continue;
        }

        await replyMessage(conn, msg);
    }
}

/**
 * TODO: This is just a toy demo and should be removed from the main product
 * Parses a single framed message and writes the appropriate response.
 * Destroys the socket on a quit command.
 */
async function replyMessage(conn: TCPConnection, msg: Buffer): Promise<void> {
    const str = msg.toString();

    if (str === 'quit\n') {
        await conn.write(Buffer.from('Bye!'));
        conn.socket.destroy();
    } else {
        await conn.write(Buffer.from(`Echo: ${str}`));
    }
}
