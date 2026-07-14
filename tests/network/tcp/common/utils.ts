import net from "node:net";

/** creates a client that connects to the given port */
export function createClient(port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(port, '127.0.0.1', () => resolve(socket));
        socket.on('error', reject);
    });
}

/** let OS pick a random port */
export function getRandomPort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const addr = server.address() as net.AddressInfo;
            server.close(() => resolve(addr.port));
        });
        server.on('error', reject);
    });
}
