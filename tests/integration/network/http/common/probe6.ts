import { HelixServer, RawHttpClient } from '../common/harness.js';
import { ResponseWriter } from '../../../../../src/network/http/response/ResponseWriter.js';

// Decodes the POST-then-GET "200 + Internal Server Error" anomaly by logging
// every response the server writes and where from. Run manually.

const origWrite = ResponseWriter.write.bind(ResponseWriter);
let scenario = 'boot';
(ResponseWriter as any).write = async (conn: unknown, response: any) => {
    const site = new Error().stack
        ?.split('\n')
        .map((l) => l.trim())
        .find((l) => l.includes('serveClient')) ?? 'unknown';
    console.log(`  [write] ${scenario}: code=${response.code} bodyLen=${response.body.length} site=${site}`);
    return origWrite(conn as any, response);
};

const server = await HelixServer.start('probe');

async function run(name: string, fn: (port: number) => Promise<void>): Promise<void> {
    scenario = name;
    console.log(`\n=== ${name} ===`);
    try {
        await fn(server.port);
    } catch (err) {
        console.log(`  !! ${err instanceof Error ? err.message : String(err)}`);
    }
}

await run('seq POST /echo CL then GET', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello');
    const r1 = await c.readResponse();
    console.log('  r1:', r1?.code, JSON.stringify(r1?.body.toString()));
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r2 = await c.readResponse();
    console.log('  r2:', r2?.code, JSON.stringify(r2?.body.toString()));
    c.destroy();
});

await run('seq POST / (non-echo) then GET /echo', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello');
    const r1 = await c.readResponse();
    console.log('  r1:', r1?.code, 'len', r1?.body.length);
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r2 = await c.readResponse();
    console.log('  r2:', r2?.code, JSON.stringify(r2?.body.toString()));
    c.destroy();
});

await run('seq POST /echo chunked then GET', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n');
    const r1 = await c.readResponse();
    console.log('  r1:', r1?.code, JSON.stringify(r1?.body.toString()), 'te=', r1?.headers.get('transfer-encoding'));
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r2 = await c.readResponse();
    console.log('  r2:', r2?.code, JSON.stringify(r2?.body.toString()));
    c.destroy();
});

await run('seq GET then POST /echo CL then GET', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    console.log('  g1:', (await c.readResponse())?.code);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 3\r\n\r\nabc');
    const r2 = await c.readResponse();
    console.log('  r2:', r2?.code, JSON.stringify(r2?.body.toString()));
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r3 = await c.readResponse();
    console.log('  r3:', r3?.code, JSON.stringify(r3?.body.toString()));
    c.destroy();
});

server.stop();
process.exit(0);
