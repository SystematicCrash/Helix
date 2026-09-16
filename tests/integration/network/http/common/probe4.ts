import { HelixServer, RawHttpClient } from '../common/harness.js';

// Round 4: raw byte dumps of the three anomalies. Run manually.

const server = await HelixServer.start('probe');

async function dump(name: string, fn: (port: number) => Promise<void>): Promise<void> {
    server.errors.length = 0;
    console.log(`\n=== ${name} ===`);
    try {
        await fn(server.port);
    } catch (err) {
        console.log(`  !! client error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (server.errors.length) {
        console.log('  server.errors:', server.errors.map((e) => (e instanceof Error ? `${e.name}: ${e.message}` : e)));
    }
}

await dump('A: pipelined POST+GET raw', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhelloGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    await new Promise((r) => setTimeout(r, 300));
    const raw = await c.peek(4096);
    console.log('  raw:', JSON.stringify(raw.toString('latin1')));
    c.destroy();
});

await dump('A2: POST then GET sequentially (two writes)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello');
    const r1 = await c.readResponse();
    console.log('  r1:', r1!.code, JSON.stringify(r1!.body.toString()), 'cl=', r1!.headers.get('content-length'));
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r2 = await c.readResponse();
    console.log('  r2:', r2!.code, JSON.stringify(r2!.body.toString()), 'cl=', r2!.headers.get('content-length'));
    c.destroy();
});

await dump('A3: GET+GET pipelined', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\nGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r1 = await c.readResponse();
    const r2 = await c.readResponse();
    console.log('  r1:', r1!.code, JSON.stringify(r1!.body.toString()));
    console.log('  r2:', r2!.code, JSON.stringify(r2!.body.toString()));
    c.destroy();
});

await dump('C: leading CRLF raw', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('\r\n\r\nGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    await new Promise((r) => setTimeout(r, 300));
    const raw = await c.peek(4096);
    console.log('  raw:', JSON.stringify(raw.toString('latin1')));
    c.destroy();
});

await dump('B: 1MB echo raw timeline', async (port) => {
    const c = await RawHttpClient.connect(port);
    const body = Buffer.alloc(1024 * 1024, 0x61);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 1048576\r\n\r\n');
    await c.send(body);
    // sample progress over time
    for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 500));
        console.log(`  t=${(i + 1) * 500}ms received=${c.bytesReceived} closed=${c.isClosed}`);
        if (c.isClosed) break;
    }
    const raw = await c.peek(200);
    console.log('  head sample:', JSON.stringify(raw.toString('latin1').slice(0, 120)));
    console.log('  tail sample:', JSON.stringify((await c.peek(c.bytesReceived)).toString('latin1').slice(-160)));
    c.destroy();
});

server.stop();
process.exit(0);
