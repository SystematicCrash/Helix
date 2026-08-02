import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';

/** Mocks */
vi.mock('../../../../../src/network/tcp/common/constants', async () => {
    const actual = await vi.importActual<typeof import('../../../../../src/network/tcp/common/constants')>('../../../../../src/network/tcp/common/constants');

    return {
        ...actual,
        WRITE_BUFFER_FLUSH_THRESHOLD: 10,
    };
});

import { Socket } from 'net';
import { createClient, getRandomPort } from '../common/utils.js';
import {TCPConnection, TCPListener, TCPErrCode, WRITE_BUFFER_FLUSH_THRESHOLD} from '../../../../../src/network/tcp';
import {spyOn} from "@vitest/spy";
import SocketWriter from "../../../../../src/network/tcp/conn/SocketWriter.js";

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

        test("should deliver written data to client when flush threshold exceeded", async () => {
            const dataPromise = new Promise<Buffer>((resolve) => client.once('data', resolve));

            const data = Buffer.alloc(WRITE_BUFFER_FLUSH_THRESHOLD, 0x41); // threshold exceeded

            await conn.write(data);
            expect(await dataPromise).toEqual(data);
        });
    });

    describe('close()', () => {
        test('should not effect pending read after local EOF', async () => {
            const readPromise = conn.read();

            await conn.close(); // local EOF | Write is closed.

            client.write(Buffer.from('hello'));
            const data = await readPromise;
            expect(data).toEqual(Buffer.from('hello'));
        });

        test('should flush write buffer before close', async () => {
            await conn.write(Buffer.from('hello'));
            const flushSpy = spyOn(SocketWriter.prototype, 'flush');
            await conn.close();
            expect(flushSpy).toHaveBeenCalled();
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
