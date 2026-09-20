import {readFileSync} from 'fs';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';
import TCPServer from "./src/network/tcp/server/TCPServer.js";
import HttpServer from "./src/network/http/server/HttpServer.js";

const PORT = Number(process.env.PORT ?? 1234);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {version: string};

async function main(): Promise<void> {
    const httpServer = new HttpServer(new TCPServer());
    await httpServer.listen(PORT);
}

main().catch(console.error);
