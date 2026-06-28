import {Socket} from 'net';

type TCPConn = {
    socket: Socket;
    reader: null | {
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

function soInit(socket: Socket): TCPConn {
    const conn: TCPConn = {
        socket, reader: null,
    };

    socket.on('data', (data: Buffer) => {
        conn.socket.pause();
        conn.reader!.resolve(data);
        conn.reader = null;
    });

    return conn;
}

function soRead(conn: TCPConn): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        conn.reader = {resolve, reject};
        conn.socket.resume();
    })
}