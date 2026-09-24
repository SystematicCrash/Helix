import {readFileSync} from 'fs';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';
import TCPServer from "./src/network/tcp/server/TCPServer.js";
import HttpServer from "./src/network/http/server/HttpServer.js";
import Router from "./src/network/http/routing/Router.js";
import {RouteSpec} from "./src/network/http/routing/types.js";
import defineRoutes from "./src/app/routes.js";
import {setServerInfo} from "./src/common/serverInfo.js";

const PORT = Number(process.env.PORT ?? 1234);
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8')) as {version: string};

function prepareTcpServer() {
    const tcpServer = new TCPServer();
    tcpServer.listen(PORT);
    return tcpServer;
}

function prepareRouteTree() {
    const router = new Router();
    defineRoutes(router);
    return router.build();
}

async function main(): Promise<void> {
   const tcpServer = prepareTcpServer();
   const routeTree = prepareRouteTree();

   setServerInfo({
       port: PORT,
       version: '1.0.0',
       iface: tcpServer.address()?.address ?? '0.0.0.0'
   });

   const httpServer = new HttpServer(tcpServer, routeTree);
   await httpServer.run();
}

main().catch(console.error);
