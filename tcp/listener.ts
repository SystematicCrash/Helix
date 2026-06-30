import * as net from "net";
import {soInit, soRead, soWrite, TCPConn} from "./socket";

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
    const conn = soInit(socket);
    this.reader.resolve(conn);
    this.reader = null;
}

/** Creates a TCP server paused on connect and starts listening on the given port. */
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

/** Echoes data back to the client in a loop until the connection is closed. */
async function serveClient(conn: TCPConn): Promise<void> {
    while (true) {
        const data = await soRead(conn);
        if (data?.length === 0) {
            console.log('end connection');
            break;
        }

        console.log('data', data);
        await soWrite(conn, data);
    }
}

export {TCPListener, listen, accept, serveClient};