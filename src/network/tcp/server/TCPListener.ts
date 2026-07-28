import * as net from "net";
import TCPConnection from "../conn/TCPConnection.js";
import {ConnectionReader} from "../common/types.js";
import {MAXIMUM_ALIVE_CONNECTIONS, TCPErrCode} from "../common/constants.js";
import TCPError from "../common/TCPError.js";


/** A TCP server with a single pending accept slot for the next incoming connection. */
export default class TCPListener {
    private reader: null|ConnectionReader = null;
    private server: net.Server|null = null;
    private aliveConnections: number = 0;

    /** Returns a promise that resolves with the next accepted connection. */
    public accept(): Promise<TCPConnection> {
        if (this.aliveConnections >= MAXIMUM_ALIVE_CONNECTIONS) {
            throw TCPError.from(TCPErrCode.MAXIMUM_CONNECTIONS_EXCEEDED);
        }

        return new Promise((resolve, reject) => {
            this.reader = {resolve, reject};
        });
    }

    /**
     * Creates a TCP server paused on connect and starts listening on the given port.
     * Sockets are paused immediately so data is not lost before a reader is registered.
     * */
    public listen(port: Number): void {
        this.server = net.createServer({
            pauseOnConnect: true,
        });
        this.server.on('connection', this.onConnection);
        this.server.listen(port);
    }

    /** Wraps the incoming conn into a TCPConnection and fulfills the pending accept promise. */
    private onConnection = (socket: net.Socket): void => {
        if (!this.reader) return;

        socket.on('close', () => this.aliveConnections--);

        const conn = new TCPConnection(socket);
        this.reader.resolve(conn);
        this.reader = null;

        this.aliveConnections++;
    }
}