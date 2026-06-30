import {Socket} from 'net';

/**
 * A TCP connection wrapping a Node.js socket with a promise-based read queue.
 * Only one read can be in flight at a time — `reader` holds the active promise callbacks.
 */
type TCPConn = {
    socket: Socket;
    error: null|Error;
    ended: boolean;
    reader: null|{
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

/** Fulfills the pending read promise with the received chunk and pauses the socket. */
function onData(data: Buffer): void {
    if (!this.reader) {
        throw new Error("reader does not exist!");
    }
    this.socket.pause();
    this.reader!.resolve(data);
    this.reader = null;
}

/** Resolves the pending read with an empty buffer to signal EOF. */
function onEnd(): void {
    if (this.reader) {
        this.reader.resolve(Buffer.from(''));
        this.reader = null;
    }
}

/**
 * Stores the error on the connection and rejects any pending read.
 * Subsequent soRead calls will fail immediately via conn.error.
 */
function onError(err: Error): void {
    this.error = err;
    if (this.reader) {
        this.reader!.reject(err);
        this.reader = null;
    }
}

/** Wraps a raw socket into a TCPConn and registers its event handlers. */
function soInit(socket: Socket): TCPConn {
    const conn: TCPConn = {
        socket,
        reader: null,
        error: null,
        ended: false
    };

    socket.on('data', onData.bind(conn));
    socket.on('end', onEnd.bind(conn));
    socket.on('error', onError.bind(conn));

    return conn;
}

/**
 * Resumes the socket and returns a promise that resolves with the next data chunk.
 * Rejects immediately if the connection has a stored error.
 */
function soRead(conn: TCPConn): Promise<Buffer> {
    if (conn.reader) {
        throw new Error("reader should be null at this step!");
    }
    return new Promise((resolve, reject) => {
        if (conn.error) return reject(conn.error);
        if (conn.ended) return reject(Buffer.from(''));

        conn.reader = {resolve, reject};
        conn.socket.resume();
    })
}

/** Writes a buffer to the socket and returns a promise that resolves on success. */
function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
    if (data.length === 0) {
        throw new Error("data length should be greater than 0!");
    }
    return new Promise((resolve, reject) => {
        if (conn.error) return reject(conn.error);

        conn.socket.write(data, (err?: Error) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

export { soInit, soRead, soWrite, TCPConn };