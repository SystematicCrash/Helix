import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Socket } from 'net';
import { createClient, getRandomPort } from './common/utils';
import TCPConnection from '../../../../src/network/tcp/TCPConnection.js';
import TCPListener from '../../../../src/network/tcp/TCPListener.js';

describe('TCPConnection', () => {
    let conn: TCPConnection;
    let client: Socket;
    let listener: TCPListener;

    beforeEach(async () => {
        const port = await getRandomPort();
        listener = new TCPListener();
        listener.listen(port);

        const acceptPromise = listener.accept();
        client = await createClient(port);
        conn = await acceptPromise;
    });

    afterEach(() => {
        client.destroy();
        (conn as any).socket.destroy();
        (listener as any).server?.close();
    });

    describe('read()', () => {
        test('reader should be null before any read() call', () => {
            expect((conn as any).reader).toBeNull();
        });

        test('reader should be set while waiting for data', () => {
            conn.read().catch(() => {});
            expect((conn as any).reader).not.toBeNull();
        });

        test('socket should resume while read() is pending', () => {
            expect((conn as any).socket.isPaused()).toBe(true);
            conn.read().catch(() => {});
            expect((conn as any).socket.isPaused()).toBe(false);
        });

        test('socket should pause after read() resolves', async () => {
            client.write(Buffer.from('hello'));
            await conn.read();
            expect((conn as any).socket.isPaused()).toBe(true);
        });

        test('should resolve with data sent by client', async () => {
            client.write(Buffer.from('hello'));
            const data = await conn.read();
            expect(data).toEqual(Buffer.from('hello'));
        });

        test('should resolve with empty buffer on EOF', async () => {
            client.end();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('should resolve with empty buffer when client is destroyed', async () => {
            client.destroy();
            const data = await conn.read();
            expect(data).toEqual(Buffer.from(''));
        });

        test('should reject immediately if a socket error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(conn.read()).rejects.toThrow('Broken pipe');
        });

        test('reader should be null after read() resolves', async () => {
            client.write(Buffer.from('hello'));
            await conn.read();
            expect((conn as any).reader).toBeNull();
        });

        test('should reject on concurrent read() calls', async () => {
            conn.read().catch(() => {});
            expect(() => conn.read()).toThrow('Another read is in progress!');
        });
    });

    describe('write()', () => {
        test('should throw if data buffer is empty', () => {
            expect(() => conn.write(Buffer.from('')))
                .toThrow('data length should be greater than 0!');
        });

        test('should reject immediately if a socket error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(conn.write(Buffer.from('hello'))).rejects.toThrow('Broken pipe');
        });

        test('should reject when socket is destroyed', async () => {
            (conn as any).socket.destroy();
            await expect(conn.write(Buffer.from('hello')))
                .rejects.toMatchObject({ code: 'ERR_STREAM_DESTROYED' });
        });

        test('should deliver written data to client', async () => {
            const dataPromise = new Promise<Buffer>((resolve) => client.once('data', resolve));
            await conn.write(Buffer.from('hello'));
            expect(await dataPromise).toEqual(Buffer.from('hello'));
        });
    });
});