import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';
import * as net from "node:net";
import TCPListener from "../../../src/network/tcp/TCPListener";
import TCPConnection from "../../../src/network/tcp/TCPConnection";

/** creates a client that connects to the given port */
function createClient(port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(port, '127.0.0.1', () => resolve(socket));
        socket.on('error', reject);
    });
}

/** let OS pick a random port */
function getRandomPort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, () => {
            const addr = server.address() as net.AddressInfo;
            server.close(() => resolve(addr.port));
        });
        server.on('error', reject);
    });
}

describe("tcp-listener", () => {

    describe("listen()", () => {
        let port: number;
        let listener: TCPListener;

        beforeEach(async () => {
            port = await getRandomPort();
            listener = new TCPListener() as any;
        });

        afterEach(() => {
            (listener as any).server?.close();
        });

        test('server should be null before listen()', () => {
            expect((listener as any).server).toBeNull();
        });

        test('should create a net.Server instance after listen()', () => {
            listener.listen(port);
            expect((listener as any).server).toBeInstanceOf(net.Server);
        });

        test('should create server with pauseOnConnect enabled', () => {
            listener.listen(port);
            expect((listener as any).server.pauseOnConnect).toBe(true);
        });

        test('should listen on the given port', async () => {
            listener.listen(port);

            const address = (listener as any).server?.address() as net.AddressInfo;
            expect(address.port).toBe(port);
        });

        test('should emit error when port is already in use', async () => {
            listener.listen(port);
            const another = new TCPListener();

            await expect(new Promise<void>((resolve, reject) => {
                (another as any).server = net.createServer();
                (another as any).server.on('error', reject);
                (another as any).server.listen(port);
            })).rejects.toThrow('EADDRINUSE');

            (another as any).server?.close();
        });
    });

    describe('accept()', () => {
        let port: number;
        let listener: TCPListener;
        let clients: net.Socket[] = [];

        beforeEach(async () => {
            port = await getRandomPort();
            listener = new TCPListener() as any;
            listener.listen(port);
        });

        afterEach(() => {
            clients.forEach(c => c.destroy());
            clients = [];
            (listener as any).server?.close();
        });

        test('should return a Promise', () => {
            const result = listener.accept();
            expect(result).toBeInstanceOf(Promise);
        });

        test('should resolve with a TCPConnection when client connects', async () => {
            const acceptPromise = listener.accept();

            const client = await createClient(port);
            clients.push(client);

            const conn = await acceptPromise;
            expect(conn).toBeInstanceOf(TCPConnection);
        });

        test('should set reader to null after connection is accepted', async () => {
            const acceptPromise = listener.accept();

            const client = await createClient(port);
            clients.push(client);

            await acceptPromise;
            expect((listener as any).reader).toBeNull();
        });

        test('should accept multiple sequential connections in order', async () => {
            const accept1 = listener.accept();
            const client1 = await createClient(port);
            clients.push(client1);
            const conn1 = await accept1;
            expect(conn1).toBeInstanceOf(TCPConnection);

            const accept2 = listener.accept();
            const client2 = await createClient(port);
            clients.push(client2);
            const conn2 = await accept2;
            expect(conn2).toBeInstanceOf(TCPConnection);

            expect(conn1).not.toBe(conn2);
        });

        test('socket should be paused immediately on connect', async () => {
            const acceptPromise = listener.accept();

            const client = await createClient(port);
            clients.push(client);

            const conn = await acceptPromise;
            expect((conn as any).socket.isPaused()).toBe(true);
        });
    });
});