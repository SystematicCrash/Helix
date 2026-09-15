import * as net from 'node:net';
import TCPListener from '../../../../../src/network/tcp/server/TCPListener.js';
import {serveClient} from '../../../../../src/network/http/server/serveClient.js';

// Round 5: instrument every conn read/write to find the 1MB echo stall. Run manually.

const t0 = Date.now();
const log = (msg: string): void => console.log(`+${Date.now() - t0}ms ${msg}`);

const listener = new TCPListener();
listener.listen(0);
await new Promise<void>((r) => (listener as any).server.once('listening', r));
const port = ((listener as any).server.address() as net.AddressInfo).port;
log(`listening on ${port}`);

const info = {port, iface: '127.0.0.1', version: 'probe'};

void (async () => {
    while (true) {
        const conn = await listener.accept();
        const socket: net.Socket = (conn as any).socket;

        socket.on('error', (e) => log(`SOCK err: ${e.message}`));
        socket.on('close', (hadErr) => log(`SOCK close hadErr=${hadErr}`));

        const origRead = conn.read.bind(conn);
        (conn as any).read = async () => {
            const d = await origRead();
            log(`read -> ${d === null ? 'null' : d.length}`);
            return d;
        };
        const origWrite = conn.write.bind(conn);
        (conn as any).write = async (data: Buffer) => {
            await origWrite(data);
            log(`write <- ${data.length} (paused=${socket.isPaused()} wl=${socket.writableLength})`);
        };
        const origFlush = conn.flush.bind(conn);
        (conn as any).flush = async () => {
            await origFlush();
            log(`flush`);
        };
        const origClose = conn.close.bind(conn);
        (conn as any).close = async () => {
            await origClose();
            log(`close`);
        };

        serveClient(conn, info).catch((e) => log(`serveClient ERROR: ${e instanceof Error ? e.message : e}`));
    }
})();

const client = net.createConnection({port, host: '127.0.0.1'});
let received = 0;
client.on('data', (c: Buffer) => {
    received += c.length;
    if (received < 100 || received % 300000 < 70000) log(`client recv total=${received}`);
});
client.on('close', () => log(`client close, total=${received}`));

await new Promise<void>((r) => client.once('connect', r));

const body = Buffer.alloc(1024 * 1024, 0x61);
client.write('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 1048576\r\n\r\n');
log('head sent');
client.write(body, () => log('client kernel accepted full body'));
log('body handed to node');

await new Promise((r) => setTimeout(r, 6000));
client.destroy();
(listener as any).server?.close();
process.exit(0);
