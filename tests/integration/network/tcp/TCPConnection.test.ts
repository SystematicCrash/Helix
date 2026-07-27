import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

/** Mocks */
vi.mock('../../../../src/network/tcp/constants', async () => {
    const actual = await vi.importActual<typeof import('../../../../src/network/tcp/constants')>('../../../../src/network/tcp/constants');

    return {
        ...actual,
        READ_TIMEOUT: 50,
        WRITE_TIMEOUT: 50,
        MAX_WRITE_BUFFER_SIZE: 1024,
    };
});

import { TCPConnection, TCPListener, TCPErrCode, MAX_WRITE_BUFFER_SIZE } from '../../../../src/network/tcp';
import { Socket } from 'net';
import { createClient, getRandomPort } from './common/utils';

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

        test('should reject read immediately if a socket error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(conn.read()).rejects.toMatchObject({
                message: 'Broken pipe',
                code: TCPErrCode.UNEXPECTED_ERROR
            });
        });

        test('reader should be null after read() resolves', async () => {
            client.write(Buffer.from('hello'));
            await conn.read();
            expect((conn as any).reader).toBeNull();
        });

        test('should reject on concurrent read() calls', async () => {
            conn.read().catch(() => {});
            await expect(() => conn.read())
                .rejects.toThrow(TCPErrCode.SIMULTANEOUS_READ);
        });

        test('should fire timeout when no data is received after specific amount of time', async () => {
            await expect(() => conn.read())
                .rejects.toThrow(TCPErrCode.READ_TIMEOUT);
        });
    });

    describe('write()', () => {
        test('should throw if data buffer is empty', async () => {
            await expect(() => conn.write(Buffer.from('')))
                .rejects.toThrow(TCPErrCode.EMPTY_DATA_BUFFER);
        });

        test('should reject write immediately if a socket error exists', async () => {
            (conn as any).socket.emit('error', new Error('Broken pipe'));
            await expect(() => conn.write(Buffer.from('hello')))
                .rejects.toMatchObject({
                    message: 'Broken pipe',
                    code: TCPErrCode.UNEXPECTED_ERROR
                });
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

        test('should fire timeout when write takes long after specific amount of time', async () => {
            vi.spyOn((conn as any).socket, 'write').mockImplementation(
                (_data, callback) => {
                    setTimeout(() => {
                        // @ts-ignore
                        callback?.(null);
                    }, 2_000); // Longer than WRITE_TIMEOUT
                    return true;
                }
            );

            await expect(conn.write(Buffer.from('hello')))
                .rejects.toThrow(TCPErrCode.WRITE_TIMEOUT);
        });

        describe('backpressure', () => {
            function createWriteBackpressureData(socket: Socket) {
                let buffered = 0;

                Object.defineProperty(socket, 'writableLength', {
                    configurable: true,
                    get: () => buffered,
                });

                vi.spyOn(socket, 'write').mockImplementation(
                    (data: Buffer, callback: (err?: Error | null) => void) => {
                        setTimeout(() => callback?.(), 10);
                        buffered += data.length;
                        return buffered < MAX_WRITE_BUFFER_SIZE;
                    }
                );
            }

            async function floodWrites(connection: TCPConnection, totalBytes: number, chunkSize = 8 * 1024): Promise<void> {
                await new Promise<void>((resolve) => {
                    let remaining = totalBytes;
                    const send = () => {
                        const toWrite = Math.min(chunkSize, remaining);
                        connection.write(Buffer.alloc(toWrite, 0x41)).then(() => {
                            remaining -= toWrite;
                            if (remaining > 0) setImmediate(send);
                            else resolve();
                        }).catch(() => resolve());
                    };
                    send();
                });
            }

            test('should throw when canWrite is false (buffer full)', async () => {
                (conn as any).canWrite = false;
                await expect(() => conn.write(Buffer.from('test')))
                    .rejects.toThrow(TCPErrCode.WRITE_BACKPRESSURE);
            });

            test('should set canWrite to false when socket writableLength exceeds MAX_WRITE_BUFFER_SIZE', async () => {
                createWriteBackpressureData((conn as any).socket);
                await floodWrites(conn, MAX_WRITE_BUFFER_SIZE);
                expect((conn as any).canWrite).toBe(false);
            });

            test('should unblock writes when drain event fires', async () => {
                const socket = (conn as any).socket;
                createWriteBackpressureData(socket);

                await floodWrites(conn, MAX_WRITE_BUFFER_SIZE);

                expect((conn as any).canWrite).toBe(false);
                await expect(() => conn.write(Buffer.from('blocked')))
                    .rejects.toThrow(TCPErrCode.WRITE_BACKPRESSURE);

                socket.emit('drain');
                expect((conn as any).canWrite).toBe(true);
            });

            test('should remain writable when no backpressure is triggered', async () => {
                createWriteBackpressureData((conn as any).socket);
                await floodWrites(conn, MAX_WRITE_BUFFER_SIZE - 100);
                expect((conn as any).canWrite).toBe(true);
            });

            test('should recover canWrite after drain even if previous writes failed', async () => {
                const socket = (conn as any).socket;
                createWriteBackpressureData(socket);

                await floodWrites(conn, MAX_WRITE_BUFFER_SIZE);

                expect((conn as any).canWrite).toBe(false);

                socket.emit('drain');
                expect((conn as any).canWrite).toBe(true);

                await conn.write(Buffer.from('after-drain'));
            });
        });
    });
});
