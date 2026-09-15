import * as net from 'node:net';
import TCPListener from '../../../../../src/network/tcp/server/TCPListener.js';
import TCPConnection from '../../../../../src/network/tcp/conn/TCPConnection.js';
import {serveClient} from '../../../../../src/network/http/server/serveClient.js';

// Round 7: capture the exact error feeding the catch-500 and the raw wire bytes.

const t0 = Date.now();
const log = (msg: string): void => console.log(`+${Date.now() - t0}ms ${msg}`);

// Wrap TCPConnection methods to log calls, results, and rejections.
for (const method of ['read', 'write', 'flush', 'close'] as const) {
    const orig = TCPConnection.prototype[method] as (...args: unknown[]) => Promise<unknown>;
    TCPConnection.prototype[method] = async function (...args: unknown[]) {
        try {
            const result = await orig.apply(this, args);
            log(`${method}(${args.map((a) => (typeof a === 'object' && a && 'length' in (a as object) ? (a as Buffer).length : a)).join(',')}) -> ${result === null ? 'null' : result instanceof Buffer ? result.length : 'ok'}`);
            return result;
        } catch (err) {
            log(`${method} REJECTED: ${err instanceof Error ? `${err.constructor.name}: ${err.message}` : err}`);
            throw err;
        }
    };
}

const listener = new TCPListener();
listener.listen(0);
await new Promise<void>((r) => (listener as any).server.once('listening', r));
const port = ((listener as any).server.address() as net.AddressInfo).port;
const info = {port, iface: '127.0.0.1', version: 'probe'};

void (async () => {
    while (true) {
        const conn = await listener.accept();
        serveClient(conn, info).catch((e) => log(`serveClient ESCAPED: ${e instanceof Error ? e.message : e}`));
    }
})();

const client = net.createConnection({port, host: '127.0.0.1'});
const chunks: string[] = [];
client.on('data', (c: Buffer) => {
    chunks.push(c.toString('latin1'));
    log(`client recv ${c.length}B: ${JSON.stringify(c.toString('latin1').slice(0, 100))}`);
});
client.on('close', () => log('client close'));

await new Promise<void>((r) => client.once('connect', r));

const send = (data: string): Promise<void> => new Promise((res, rej) => client.write(data, (e) => (e ? rej(e) : res())));

await send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello');
log('--- POST sent, waiting 300ms');
await new Promise((r) => setTimeout(r, 300));

await send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
log('--- GET sent, waiting 5s');
await new Promise((r) => setTimeout(r, 5000));

console.log('\n=== FULL WIRE (client side) ===');
console.log(JSON.stringify(chunks.join('')));
client.destroy();
(listener as any).server?.close();
process.exit(0);
