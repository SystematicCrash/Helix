import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import net from "net";
import {Server, Socket} from "node:net";
import {createClient, getRandomPort} from "../common/utils.js";
import SocketWriter from "../../../../../src/network/tcp/conn/SocketWriter.js";
import {
    MAX_WRITE_BUFFER_SIZE,
    TCPErrCode,
    TCPError,
    WRITE_BUFFER_FLUSH_THRESHOLD,
} from "../../../../../src/network/tcp/index.js";
import {spyOn} from "@vitest/spy";

/** Mocks */
vi.mock('../../../../../src/network/tcp/common/constants', async () => {
    const actual = await vi.importActual<typeof import('../../../../../src/network/tcp/common/constants')>('../../../../../src/network/tcp/common/constants');

    return {
        ...actual,
        WRITE_TIMEOUT: 50,
        MAX_WRITE_BUFFER_SIZE: 1024,
        WRITE_BUFFER_FLUSH_THRESHOLD: 10,
    };
});

describe('SocketWriter', () => {
    let server: Server;
    let client: Socket;
    let socket: Socket;
    let sockWriter: SocketWriter;

    beforeEach(async () => {
        const port = await getRandomPort();

        server = net.createServer();
        server.listen(port);

        const socketPromise = new Promise<Socket>((resolve) => server.on('connection', resolve));
        client = await createClient(port);

        socket = await socketPromise;
        socket.pause();

        sockWriter = new SocketWriter(socket);
    });

    afterEach(() => {
        client.destroy();
        socket.destroy();
        server.close();
        vi.restoreAllMocks();
    });

    describe('immediateWrite()', () => {
        test('should throw if data buffer is empty', async () => {
            await expect(() => sockWriter.immediateWrite(Buffer.from('')))
                .rejects.toThrow(TCPErrCode.EMPTY_DATA_BUFFER);
        });

        test('should deliver written data to the client', async () => {
            const dataPromise = new Promise<Buffer>((resolve) => client.once('data', resolve));
            await sockWriter.immediateWrite(Buffer.from('hello'));
            expect(await dataPromise).toEqual(Buffer.from('hello'));
        });

        test('should throw when data length is zero', async () => {
            const writePromise = sockWriter.immediateWrite(Buffer.from(''))
            await expect(writePromise).rejects.toThrow(TCPErrCode.EMPTY_DATA_BUFFER);
        });

        test('should fire timeout when write takes long after specific amount of time', async () => {
            vi.spyOn((sockWriter as any).socket, 'write').mockImplementation(
                (_data, callback) => {
                    setTimeout(() => {
                        // @ts-ignore
                        callback?.(null);
                    }, 2_000); // Longer than WRITE_TIMEOUT
                    return true;
                }
            );

            await expect(sockWriter.immediateWrite(Buffer.from('hello')))
                .rejects.toThrow(TCPErrCode.WRITE_TIMEOUT);
        });
    });

    describe('write()', () => {
        test('should buffer given data when flush threshold is not exceeded', async () => {
            const spy = vi.spyOn(SocketWriter.prototype, 'immediateWrite');
            await sockWriter.write(Buffer.from('hello'));
            expect(spy).not.toHaveBeenCalled();
        });

        test('should write given data when flush threshold is exceeded', async () => {
            const spy = vi.spyOn(SocketWriter.prototype, 'immediateWrite');
            await sockWriter.write(Buffer.alloc(WRITE_BUFFER_FLUSH_THRESHOLD, 0x41));
            expect(spy).toHaveBeenCalled();
        });

        test('should deliver all the buffered data after the threshold is exceeded', async () => {
            const len = WRITE_BUFFER_FLUSH_THRESHOLD;
            const dataPromise = new Promise<Buffer>((resolve) => client.on('data', resolve));

            for (let i = 0; i < len; i++) {
                await sockWriter.write(Buffer.from('a'));
            }
            await expect(dataPromise).resolves.toEqual(Buffer.from('a'.repeat(len)));
        });

        test('should not hand the data to kernel before threshold is exceeded', async () => {
            const len = WRITE_BUFFER_FLUSH_THRESHOLD;
            const spy = spyOn(SocketWriter.prototype, 'immediateWrite');

            for (let i = 0; i < len - 1; i++) {
                await sockWriter.write(Buffer.from('a'));
            }

            expect(spy).not.toHaveBeenCalled();
            await sockWriter.write(Buffer.from('a'));
            expect(spy).toHaveBeenCalled();
        });
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

        async function floodWrites(writer: SocketWriter, totalBytes: number, chunkSize = 8 * 1024): Promise<void> {
            await new Promise<void>((resolve) => {
                let remaining = totalBytes;
                const send = () => {
                    const toWrite = Math.min(chunkSize, remaining);
                    writer.immediateWrite(Buffer.alloc(toWrite, 0x41)).then(() => {
                        remaining -= toWrite;
                        if (remaining > 0) setImmediate(send);
                        else resolve();
                    }).catch(() => resolve());
                };
                send();
            });
        }

        test('should throw when canWrite is false (buffer full)', async () => {
            (sockWriter as any).canWrite = false;
            await expect(() => sockWriter.write(Buffer.from('test')))
                .rejects.toThrow(TCPErrCode.WRITE_BACKPRESSURE);
        });

        test('should set canWrite to false when conn writableLength exceeds MAX_WRITE_BUFFER_SIZE', async () => {
            createWriteBackpressureData((sockWriter as any).socket);
            await floodWrites(sockWriter, MAX_WRITE_BUFFER_SIZE);
            expect((sockWriter as any).canWrite).toBe(false);
        });

        test('should remain writable when no backpressure is triggered', async () => {
            createWriteBackpressureData((sockWriter as any).socket);
            await floodWrites(sockWriter, MAX_WRITE_BUFFER_SIZE - 100);
            expect((sockWriter as any).canWrite).toBe(true);
        });

        test('should recover canWrite after drain even if previous writes failed', async () => {
            const socket = (sockWriter as any).socket;
            createWriteBackpressureData(socket);

            await floodWrites(sockWriter, MAX_WRITE_BUFFER_SIZE);

            expect((sockWriter as any).canWrite).toBe(false);

            socket.emit('drain');
            expect((sockWriter as any).canWrite).toBe(true);

            await sockWriter.write(Buffer.from('after-drain'));
        });

        test('should unblock writes when drain event fires', async () => {
            const socket = (sockWriter as any).socket;
            createWriteBackpressureData(socket); // SocketWriter test

            await floodWrites(sockWriter, MAX_WRITE_BUFFER_SIZE);

            expect((sockWriter as any).canWrite).toBe(false);
            await expect(() => sockWriter.write(Buffer.from('blocked')))
                .rejects.toThrow(TCPErrCode.WRITE_BACKPRESSURE);

            socket.emit('drain');
            expect((sockWriter as any).canWrite).toBe(true);
        });
    });

    describe('finish()', () => {
        test('should set the finished to true after finish', async () => {
            expect(sockWriter.isFinished).toBe(false);
            sockWriter.finish(null);
            expect(sockWriter.isFinished).toBe(true);
        });

        test('should reject the pending write after finish', async () => {
            const writePromise = sockWriter.immediateWrite(Buffer.from('hello'));
            sockWriter.finish(TCPError.from(TCPErrCode.UNEXPECTED_ERROR));
            await expect(writePromise).rejects.toThrow(TCPErrCode.UNEXPECTED_ERROR);
        });

        test('should reject the pending write with default error after finish', async () => {
            const writePromise = sockWriter.immediateWrite(Buffer.from('hello'));
            sockWriter.finish(null);
            await expect(writePromise).rejects.toThrow(TCPErrCode.CLOSED_WHILE_WRITE);
        });

        test('should throw when write after finish', async () => {
            sockWriter.finish(null);
            const writePromise = sockWriter.immediateWrite(Buffer.from('hello'));
            await expect(writePromise).rejects.toThrow(TCPErrCode.WRITE_AFTER_EOF);
        });
    });
});