import {describe, test, expect, beforeEach, afterEach} from 'vitest';
import TCPConnection from "../../../src/network/tcp/TCPConnection";
import TCPListener from "../../../src/network/tcp/TCPListener";
import {createClient, getRandomPort} from "./common/utils";
import {Socket} from "net";

describe("TCPConnection", () => {
    let conn: TCPConnection;
    let client: Socket;

    beforeEach(async () => {
        const port = await getRandomPort();
        const listener = new TCPListener();
        listener.listen(port);

        const acceptPromise = listener.accept();

        client = await createClient(port);
        conn = await acceptPromise;
    });

    afterEach(async () => {
        client.destroy();
        (conn as any).socket.destroy();
    });

    describe("read()", () => {

        test('reader is null before any read() call', () => {
            expect((conn as any).reader).toBeNull();
        });

        test('stores a pending reader while waiting for data', () => {
            expect((conn as any).reader).toBeNull();
            conn.read().catch(() => {});
            expect((conn as any).reader).not.toBeNull();
        });

        test('resumes the socket while read() is pending', () => {
            expect((conn as any).socket.isPaused()).toBe(true);
            conn.read().catch(() => {});
            expect((conn as any).socket.isPaused()).toBe(false);
        });

        test('pauses the socket once read() resolves', async () => {
            client.write(Buffer.from('Hello'));
            await conn.read();
            expect((conn as any).socket.isPaused()).toBe(true);
        });

        test('resolves with the data sent by the client', async () => {
            client.write(Buffer.from('hello'));
            const data = await conn.read();
            expect(data).toEqual(Buffer.from('hello'));
        });

        test('resolves with an empty buffer on EOF (client sent FIN)', async () => {
            client.end();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('resolves with an empty buffer when the remote end is destroyed', async () => {
            client.destroy();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('rejects immediately when a stored error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe!'));
            await expect(conn.read()).rejects.toThrow('Broken pipe!');
        });
    });

    describe("write()", () => {

        test('throws synchronously if data is empty', () => {
            expect(() => conn.write(Buffer.from('')))
                .toThrow('data length should be greater than 0!');
        });

        test('rejects immediately when a stored error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe!'));
            await expect(conn.write(Buffer.from('Hello'))).rejects.toThrow('Broken pipe!');
        });

        test('rejects when the socket is destroyed', async () => {
            (conn as any).socket.destroy();
            await expect(conn.write(Buffer.from('hello'))).rejects.toMatchObject({code: 'ERR_STREAM_DESTROYED'});
        });

        test('client receives the data written to the connection', async () => {
            const dataPromise = new Promise((resolve) => client.once('data', resolve));
            await conn.write(Buffer.from('Hello'));
            expect(await dataPromise).toEqual(Buffer.from('Hello'));
        });
    });
});
