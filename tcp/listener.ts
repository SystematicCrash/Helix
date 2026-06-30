import * as net from "net";
import {soInit, soRead, soWrite, TCPConn} from "./socket";
import {bufPush, popMessage, DynBuf} from "../mem/buffer";

/** A TCP server with a single pending accept slot for the next incoming connection. */
type TCPListener = {
    server: net.Server;
    reader: null|{
        resolve: (conn: TCPConn) => void;
        reject: (err: Error) => void;
    }
};

/** Wraps the incoming socket into a TCPConn and fulfills the pending accept promise. */
function onConnection(socket: net.Socket): void {
    if (!this.reader) return;

    const conn = soInit(socket);
    this.reader.resolve(conn);
    this.reader = null;
}

/**
 * Creates a TCP server paused on connect and starts listening on the given port.
 * Sockets are paused immediately so data is not lost before a reader is registered.
 * */
function listen(port: Number): TCPListener {
    const server: net.Server = net.createServer({
        pauseOnConnect: true,
    });
    const listener = {server, reader: null};
    server.on('connection', onConnection.bind(listener));

    server.listen(port);
    return listener;
}

/** Returns a promise that resolves with the next accepted connection. */
function accept(listener: TCPListener): Promise<TCPConn> {
    return new Promise((resolve, reject) => {
        listener.reader = {resolve, reject};
    })
}

/**
 * Reads newline-delimited messages in a loop, dispatching each to replyMessage
 * until the connection is closed.
 */
async function serveClient(conn: TCPConn): Promise<void> {
    const buf: DynBuf = { data: Buffer.alloc(0), length: 0, start: 0 };

    while (true) {
        const msg: Buffer|null = popMessage(buf);

        if (!msg) {
            const data = await soRead(conn);
            if (data.length === 0) break;
            bufPush(buf, data);
            continue;
        }

        await replyMessage(conn, msg);
    }
}

/**
 * Parses a single framed message and writes the appropriate response.
 * Destroys the socket on a quit command.
 */
async function replyMessage(conn: TCPConn, msg: Buffer): Promise<void> {
    const str = msg.toString();

    if (str === 'quit\n') {
        await soWrite(conn, Buffer.from('Bye!'));
        conn.socket.destroy();
    } else {
        await soWrite(conn, Buffer.from(`Echo: ${str}`));
    }
}

export {TCPListener, listen, accept, serveClient};