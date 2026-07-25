import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
/** Mocks */
vi.mock('../../../../src/network/tcp/constants', async () => {
    const actual = await vi.importActual<typeof import('../../../../src/network/tcp/constants')>('../../../../src/network/tcp/constants');

    return {
        ...actual,
        IDLE_TIMEOUT: 50,
    };
});

import * as net from 'node:net';
import { createClient, getRandomPort } from './common/utils';
import {TCPListener, TCPConnection, TCPCode} from '../../../../src/network/tcp';
import {delay} from "@vitest/utils/timers";

describe('TCPListener', () => {

    describe('listen()', () => {
        let port: number;
        let listener: TCPListener;

        beforeEach(async () => {
            port = await getRandomPort();
            listener = new TCPListener();
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

        test('should enable pauseOnConnect on the server', () => {
            listener.listen(port);
            expect((listener as any).server.pauseOnConnect).toBe(true);
        });

        test('should bind to the given port', () => {
            listener.listen(port);
            const address = (listener as any).server?.address() as net.AddressInfo;
            expect(address.port).toBe(port);
        });

        test('should error when port is already in use', async () => {
            listener.listen(port);

            const another = new TCPListener();
            await expect(
                new Promise<void>((_, reject) => {
                    (another as any).server = net.createServer();
                    (another as any).server.on('error', reject);
                    (another as any).server.listen(port);
                })
            ).rejects.toMatchObject({ code: 'EADDRINUSE' });

            (another as any).server?.close();
        });
    });

    describe('accept()', () => {
        let port: number;
        let listener: TCPListener;
        let clients: net.Socket[] = [];

        beforeEach(async () => {
            port = await getRandomPort();
            listener = new TCPListener();
            listener.listen(port);
        });

        afterEach(() => {
            clients.forEach(c => c.destroy());
            clients = [];
            (listener as any).server?.close();
        });

        test('reader should be null before accept()', () => {
            expect((listener as any).reader).toBeNull();
        });

        test('should return a Promise', () => {
            const result = listener.accept();
            result.catch(() => {});
            expect(result).toBeInstanceOf(Promise);
        });

        test('should resolve with a TCPConnection on connect', async () => {
            const acceptPromise = listener.accept();
            clients.push(await createClient(port));

            const conn = await acceptPromise;
            expect(conn).toBeInstanceOf(TCPConnection);
        });

        test('should clear reader after connection is accepted', async () => {
            const acceptPromise = listener.accept();
            clients.push(await createClient(port));

            await acceptPromise;
            expect((listener as any).reader).toBeNull();
        });

        test('should not crash when connection arrives before accept()', async () => {
            // connect before accept() — reader is null, should be ignored
            clients.push(await createClient(port));
            await new Promise(r => setTimeout(r, 50));
            expect((listener as any).reader).toBeNull();
        });

        test('second accept() should overwrite the first', async () => {
            let firstResolved = false;
            let secondResolved = false;

            const first  = listener.accept().then(() => { firstResolved  = true; });
            const second = listener.accept().then(() => { secondResolved = true; });

            clients.push(await createClient(port));

            await second;
            await new Promise(r => setTimeout(r, 50));

            expect(firstResolved).toBe(false);
            expect(secondResolved).toBe(true);
        });

        test('should accept multiple sequential connections', async () => {
            const accept1 = listener.accept();
            clients.push(await createClient(port));
            const conn1 = await accept1;
            expect(conn1).toBeInstanceOf(TCPConnection);

            const accept2 = listener.accept();
            clients.push(await createClient(port));
            const conn2 = await accept2;
            expect(conn2).toBeInstanceOf(TCPConnection);

            expect(conn1).not.toBe(conn2);
        });

        test('accepted socket should be paused on connect', async () => {
            const acceptPromise = listener.accept();
            clients.push(await createClient(port));

            const conn = await acceptPromise;
            expect((conn as any).socket.isPaused()).toBe(true);
        });

        test('should fire idle timeout when no activity is performed on connection', async () => {
            const acceptPromise = listener.accept();
            clients.push(await createClient(port));

            const conn = await acceptPromise;
            await delay(100); // Longer than IDLE_TIMEOUT

            expect(conn.error?.code).toEqual(TCPCode.IDLE_TIMEOUT);
        });
    });
});