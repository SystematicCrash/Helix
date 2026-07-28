import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {TCPErrCode, TCPError} from "../../../../../src/network/tcp/index.js";
import net, {Socket} from "net";
import {createClient, getRandomPort} from "../common/utils.js";
import SocketReader from "../../../../../src/network/tcp/conn/SocketReader.js";
import {Server} from "node:net";

/** Mocks */
vi.mock('../../../../../src/network/tcp/common/constants', async () => {
    const actual = await vi.importActual<typeof import('../../../../../src/network/tcp/common/constants')>('../../../../../src/network/tcp/common/constants');

    return {
        ...actual,
        READ_TIMEOUT: 50,
    };
});

describe('SocketReader', () => {
    let server: Server;
    let client: Socket;
    let socket: Socket;
    let sockReader: SocketReader;

    beforeEach(async () => {
        const port = await getRandomPort();

        server = net.createServer();
        server.listen(port);

        const socketPromise = new Promise<Socket>((resolve) => {
            server.once('connection', resolve);
        });

        client = await createClient(port);
        socket = await socketPromise;
        socket.pause();

        sockReader = new SocketReader(socket);
    });

    afterEach(async () => {
        client.destroy();
        socket.destroy();
        server.close();
    });

    describe('read()', () => {
        test('reader should be null before any read() call', () => {
            expect((sockReader as any).reader).toBeNull();
        });

        test('reader should be set while waiting for data', () => {
            sockReader.read().catch(() => {});
            expect((sockReader as any).reader).not.toBeNull();
        });

        test('conn should resume while read() is pending', () => {
            expect((sockReader as any).socket.isPaused()).toBe(true);
            sockReader.read().catch(() => {});
            expect((sockReader as any).socket.isPaused()).toBe(false);
        });

        test('conn should pause after read() resolves', async () => {
            client.write(Buffer.from('hello'));
            await sockReader.read();
            expect((sockReader as any).socket.isPaused()).toBe(true);
        });

        test('reader should be null after read() resolves', async () => {
            client.write(Buffer.from('hello'));
            await sockReader.read();
            expect((sockReader as any).reader).toBeNull();
        });

        test('should reject on concurrent read() calls', async () => {
            sockReader.read().catch(() => {});
            await expect(() => sockReader.read())
                .rejects.toThrow(TCPErrCode.SIMULTANEOUS_READ);
        });

        test('should fire timeout when no data is received after specific amount of time', async () => {
            await expect(() => sockReader.read())
                .rejects.toThrow(TCPErrCode.READ_TIMEOUT);
        });
    });
});