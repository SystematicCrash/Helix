import {readFileSync} from 'fs';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';
import TCPListener from "./src/network/tcp/server/TCPListener.js";
import {serveClient} from "./src/network/http/server/serveClient.js";
import {ServerInfo} from "./src/server/ServerInfo.js";

const PORT = Number(process.env.PORT ?? 1234);

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {version: string};

async function main(): Promise<void> {
    const listener = new TCPListener();
    listener.listen(PORT);

    const addr = listener.address();
    const info: ServerInfo = {
        port: addr?.port ?? PORT,
        iface: addr?.address ?? '0.0.0.0',
        version: pkg.version,
    };

    console.log(`Helix ${info.version} listening on http://${info.iface}:${info.port}`);

    while (true) {
        const conn = await listener.accept();
        serveClient(conn, info).catch(console.error);
    }
}
main().catch(console.error);
