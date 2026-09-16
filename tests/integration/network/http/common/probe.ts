import { HelixServer, RawHttpClient } from '../common/harness.js';

// Probe script — run manually, not part of the suite.
// Usage: npx tsx tests/integration/network/http/common/probe.ts

async function probe(name: string, fn: (port: number) => Promise<void>): Promise<void> {
    const server = await HelixServer.start('probe');
    try {
        await fn(server.port);
        console.log(`OK   ${name}`);
    } catch (err) {
        console.log(`FAIL ${name}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
        server.stop();
    }
}

await probe('GET / 200 html + content-length', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET / HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, [...r!.headers.keys()], 'len=', r!.body.length);
    c.destroy();
});

await probe('GET /echo (GET with body)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello');
    const r = await c.readResponse();
    console.log('  ->', r!.code, [...r!.headers.keys()], JSON.stringify(r!.body.toString()));
    c.destroy();
});

await probe('pipelined 3 requests in one write', async (port) => {
    const c = await RawHttpClient.connect(port);
    const req = 'GET /echo HTTP/1.1\r\nHost: x\r\n\r\n'.repeat(3);
    await c.send(req);
    for (let i = 0; i < 3; i++) {
        const r = await c.readResponse();
        console.log('  -> resp', i, r!.code, 'len', r!.body.length);
    }
    c.destroy();
});

await probe('EOF mid-head', async (port) =>  {
    const c = await RawHttpClient.connect(port);
    await c.send('GET / HTTP/1.1\r\nHost: x');
    await new Promise((r) => setTimeout(r, 100));
    c.end();
    await c.waitClose();
    console.log('  -> closed, pending bytes:', c.bytesReceived);
});

await probe('EOF mid-body (POST CL=10, send 4)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1-al.1\r\nHost: x\r\nContent-Length: 10\r\n\r\nabcd');
    await new Promise((r) => setTimeout(r, 100));
    c.end();
    await c.waitClose();
    console.log('  -> closed, pending bytes:', c.bytesReceived);
});

await probe('idle timeout (no request sent)', async (port) => {
    const c = await RawHttpClient.connect(port);
    const start = Date.now();
    await c.waitClose(10_000);
    console.log('  -> closed after', Date.now() - start, 'ms; bytes:', c.bytesReceived);
});

await probe('GET /files/... missing file', async (port) => cwd_workaround(port));
async function cwd_workaround(port: number): Promise<void> {
    const c = await RawHttpClient.connect(port);
    await c.send('GET /files/definitely-missing.txt HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString().slice(0, 60)));
    c.destroy();
}

await probe('HEAD / (server treats as normal GET?)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('HEAD / HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, 'cl=', r!.headers.get('content-length'), 'bodylen=', r!.body.length);
    c.destroy();
});

await probe('double Content-Length', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nContent-Length: 5\r\n\r\nhello');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString().slice(0, 80)));
    c.destroy();
});

await probe('101 unknown methods -> ? (INVALID method)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('FOO / HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString().slice(0, 80)));
    c.destroy();
});

await probe('HTTP/1.0 request', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET / HTTP/1.0\r\nHost: x\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, r!.version, 'cl=', r!.headers.get('content-length'));
    c.destroy();
});
