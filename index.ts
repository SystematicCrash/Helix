import * as net from "net";

function getClient(socket: net.Socket): String {
    return `${socket.remoteAddress} ${socket.remotePort}`;
}

function registerServerHandlers(server: net.Server): void {
    server.on('connection', newConn);
    server.on('listening', onListen);
    server.on('error', onError);
    server.on('drop', onDrop);
    server.on('close', onClose);
}

function registerSocketHandlers(socket: net.Socket): void {
    socket.on("data", (data: Buffer) => onData(socket, data));
    socket.on("end", onEnd);
}

function newConn(socket: net.Socket): void {
    console.log('new connection:', socket.remoteAddress, socket.remotePort, '\n');
    registerSocketHandlers(socket);
}

function onError(err: Error): void {
    console.log(`An error occurred: ${err.message}`, '\n');
}

function onData(socket: net.Socket, data: Buffer): void {
    console.log('Received data:', data.toString());
    console.log('Sender:', getClient(socket));
    console.log('\n');
}

function onEnd(): void {
    console.log('Connection closed by the peer');
}

function onClose(): void {
    console.log('Connection closed by the server');
}

function onListen(): void {
    console.log('Server started to listening');
}

function onDrop(dropped: net.DropArgument): void {
    console.log(`Dropped connection with: ${dropped.remoteAddress} ${dropped.remotePort}`);
}

let server = net.createServer();
registerServerHandlers(server);
server.maxConnections = 5;

server.listen({
    host: '127.0.0.1',
    port: 1234,
});