import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';
import TCPConnection from "../../../src/network/tcp/TCPConnection";
import TCPListener from "../../../src/network/tcp/TCPListener";
import {createClient, getRandomPort} from "./common/utils";
import {Socket} from "net";

describe("TCPConnection", () => {

    describe("read()", () => {
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
            conn.socket.destroy();
        });

        test('sets reader value after read', async () => {
            expect((conn as any).reader).toBeNull();
            const readPromise = conn.read();
            expect((conn as any).reader).not.toBeNull();
        });

        test('should resume socket after read', async () => {
            expect((conn as any).socket.isPaused()).toBe(true);
            const readPromise = conn.read();
            expect((conn as any).socket.isPaused()).toBe(false);
        });

        test('should return buffered data after read', async () => {
            client.write(Buffer.from('hello'));
            const data = await conn.read();
            expect(data).toEqual(Buffer.from('hello'));
        });

        test('should return empty buffer after EOF (other side sent FIN)', async () => {
            client.end();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('should return empty buffer after RST (socket destroyed)', async () => {
            client.destroy();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('should reject on read after error', async () =>  {
            (conn as any).socket.emit('error', new Error('Broken pipe!'));
            await expect(conn.read()).rejects.toThrow(new Error('Broken pipe!'));
        });

   });
});