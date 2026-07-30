import { describe, test, expect, beforeEach, afterEach } from 'vitest';

import { Socket } from 'net';
import { createClient, getRandomPort } from '../common/utils.js';
import { TCPConnection, TCPListener, TCPErrCode } from '../../../../../src/network/tcp';

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
        test('should resolve with data sent by client', async () => {
            client.write(Buffer.from('hello'));
            const data = await conn.read();
            expect(data).toEqual(Buffer.from('hello'));
        });

        test('should resolve pending read with null on EOF', async () => {
            const readPromise = conn.read();
            client.end();
            await expect(readPromise).resolves.toBeNull();
        });

        test('should resolve with null when client is destroyed', async () => {
            const readPromise = conn.read();
            client.destroy();
            await expect(readPromise).resolves.toBeNull();
        });

        test('should reject read immediately if a conn error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(conn.read()).rejects.toMatchObject({
                message: 'Broken pipe',
                code: TCPErrCode.UNEXPECTED_ERROR
            });
        });
    });

    describe('write()', () => {
        test('should reject write immediately if a conn error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(() => conn.write(Buffer.from('hello')))
                .rejects.toMatchObject({
                    message: 'Broken pipe',
                    code: TCPErrCode.UNEXPECTED_ERROR
                });
        });

        test('should deliver written data to client', async () => {
            const dataPromise = new Promise<Buffer>((resolve) => client.once('data', resolve));
            await conn.write(Buffer.from('hello'));
            expect(await dataPromise).toEqual(Buffer.from('hello'));
        });
    });

    describe('close()', () => {
        test('should not effect pending read after local EOF', async () => {
            const readPromise = conn.read();

            conn.close(); // local EOF | Write is closed.

            client.write(Buffer.from('hello'));
            const data = await readPromise;
            expect(data).toEqual(Buffer.from('hello'));
        });
    });

    describe('forceClose()', () => {
        test('should resolve pending read with null after force close', async () => {
            const readPromise = conn.read();
            conn.forceClose();
            await expect(readPromise).resolves.toBeNull();
        });

        test('should reject when conn is force closed', async () => {
            conn.forceClose();
            await expect(conn.write(Buffer.from('hello')))
                .rejects.toThrow(TCPErrCode.WRITE_AFTER_CLOSE);
        });
    });

});
