import { HelixServer, RawHttpClient } from '../common/harness.js';

// Round 3: pipelining/bodies/limits. Run manually.

const server = await HelixServer.start('probe');

async function show(name: string, fn: (port: number) => Promise<void>): Promise<void> {
    server.errors.length = 0;
    try {
        await fn(server.port);
    } catch (err) {
        console.log(`  !! client error: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (server.errors.length) {
        console.log(`  [${name}] server.errors:`, server.errors.map((e) => (e instanceof Error ? e.message : e)));
    }
}

await show('pipelined POST(CL)+GET in one write', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhelloGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r1 = await c.readResponse();
    const r2 = await c.readResponse();
    console.log('  ->', r1!.code, JSON.stringify(r1!.body.toString()), '|', r2!.code, JSON.stringify(r2!.body.toString()));
    c.destroy();
});

await show('garbage between pipelined requests', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhelloXXGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r1 = await c.readResponse();
    console.log('  -> r1', r1!.code, JSON.stringify(r1!.body.toString()));
    const r2 = await c.readResponse().catch((e) => e);
    console.log('  -> r2', r2 instanceof Error ? r2.message : `${r2.code} ${JSON.stringify(r2.body.toString())}`);
    c.destroy();
});

await show('chunked request echo -> chunked response?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, 'te=', r!.headers.get('transfer-encoding'), 'cl=', r!.headers.get('content-length'), JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('chunked with extensions + uppercase hex', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\nA;name=val\r\n0123456789\r\n0A\r\nABCDEFGHIJ\r\n0\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('CL over limit (head only)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 1048577\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('CL exactly at limit (1MB echo)', async (port) => {
    const c = await RawHttpClient.connect(port);
    const body = Buffer.alloc(1024 * 1024, 0x61);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 1048576\r\n\r\n');
    await c.send(body);
    const r = await c.readResponse(20_000);
    console.log('  ->', r!.code, 'cl=', r!.headers.get('content-length'), 'len=', r!.body.length, 'ok=', r!.body.equals(body));
    c.destroy();
});

await show('request line too long -> 414?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send(`GET /${'a'.repeat(8000)} HTTP/1.1\r\nHost: x\r\n\r\n`);
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('header value too long -> 400?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send(`GET /echo HTTP/1.1\r\nHost: x\r\nX-Long: ${'a'.repeat(8001)}\r\n\r\n`);
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('missing Host -> 400?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /echo HTTP/1.1\r\nX-Foo: bar\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('GET with chunked TE -> 400?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('CL + TE both -> 400?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    c.destroy();
});

await show('leading CRLF before request line -> tolerated?', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('\r\n\r\nGET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code);
    c.destroy();
});

await show('101 headers -> accepted?', async (port) => {
    const c = await RawHttpClient.connect(port);
    const headers = Array.from({length: 101}, (_, i) => `X-H${i}: v`).join('\r\n');
    await c.send(`GET /echo HTTP/1.1\r\nHost: x\r\n${headers}\r\n\r\n`);
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString().slice(0, 40)));
    c.destroy();
});

await show('/sheep chunked first chunk', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /sheep HTTP/1.1\r\nHost: x\r\n\r\n');
    const head = await c.readHead();
    console.log('  ->', head.code, 'te=', head.headers.get('transfer-encoding'));
    const line = await (c as any).readLine(3000);
    console.log('  -> first chunk-size line:', JSON.stringify(line));
    c.destroy();
});

await show('invalid Content-Length variants', async (port) => {
    for (const cl of ['-5', '5 5', 'abc', '+5']) {
        const c = await RawHttpClient.connect(port);
        await c.send(`POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: ${cl}\r\n\r\n`);
        const r = await c.readResponse();
        console.log(`  -> CL=${JSON.stringify(cl)}:`, r!.code, JSON.stringify(r!.body.toString()));
        c.destroy();
    }
});

server.stop();
process.exit(0);
