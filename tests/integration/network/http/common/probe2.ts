import { HelixServer, RawHttpClient } from '../common/harness.js';

// Focused diagnostics for EOF-mid-request behavior. Run manually.

const server = await HelixServer.start('probe');

async function show(name: string, fn: (port: number) => Promise<void>): Promise<void> {
    server.errors.length = 0;
    try {
        await fn(server.port);
    } catch (err) {
        console.log(`  !! client error: ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log(`  [${name}] server.errors:`, server.errors.map((e) => (e instanceof Error ? e.message : e)));
}

await show('EOF mid-head (delay between data and FIN)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET / HTTP/1.1\r\nHost: x');
    await new Promise((r) => setTimeout(r, 100));
    c.end();
    await c.waitClose();
    console.log('  -> closed, bytes:', c.bytesReceived, JSON.stringify(c.pendingToString?.()));
});

await show('EOF mid-head (data+FIN together)', async (port) => {
    const c = await RawHttpClient.connect(port);
    c.socket.write('GET / HTTP/1.1\r\nHost: x', () => c.end());
    await c.waitClose();
    console.log('  -> closed, bytes:', c.bytesReceived);
});

await show('EOF mid-body CL=10 send 4', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nContent-Length: 10\r\n\r\nabcd');
    await new Promise((r) => setTimeout(r, 100));
    c.end();
    await c.waitClose();
    console.log('  -> closed, bytes:', c.bytesReceived);
});

await show('EOF mid-chunked-body', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('POST /echo HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhel');
    await new Promise((r) => setTimeout(r, 100));
    c.end();
    await c.waitClose();
    console.log('  -> closed, bytes:', c.bytesReceived);
});

await show('garbage bytes (not HTTP)', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('\x00\x01\x02\r\n\r\n');
    const r = await c.readResponse();
    console.log('  ->', r!.code, JSON.stringify(r!.body.toString()));
    await c.waitClose();
});

await show('empty request then FIN (clean)', async (port) => {
    const c = await RawHttpClient.connect(port);
    c.end();
    await c.waitClose();
    console.log('  -> closed, bytes:', c.bytesReceived);
});

await show('RST destroy immediately after request', async (port) => {
    const c = await RawHttpClient.connect(port);
    await c.send('GET / HTTP/1.1\r\nHost: x\r\n\r\n');
    await c.waitForBytes(1);
    c.destroy();
    await new Promise((r) => setTimeout(r, 200));
    console.log('  -> destroyed; server still accepting?');
    const c2 = await RawHttpClient.connect(port);
    await c2.send('GET /echo HTTP/1.1\r\nHost: x\r\n\r\n');
    const r = await c2.readResponse();
    console.log('  -> new conn works:', r!.code);
    c2.destroy();
});

server.stop();
process.exit(0);
