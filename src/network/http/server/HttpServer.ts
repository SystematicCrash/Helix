import TCPServer from "../../tcp/server/TCPServer.js";
import {HttpConnection} from "./HttpConnection.js";
import {buildTree, RouteTree} from "../routing/buildTree.js";

export default class HttpServer {
    private isRunning = false;

    constructor(
        private tcpServer: TCPServer,
        private routeTree: RouteTree
    ) {}

    /**
     * Starts the HTTP server listening on the specified port.
     */
    public async run(): Promise<void> {
        this.isRunning = true;

        while (this.isRunning) {
            try {
                const conn = await this.tcpServer.accept();
                const httpConn = new HttpConnection(conn, this.routeTree);
                httpConn.handle().catch((err) => {
                    console.error("[HttpServer] Unhandled client failure:", err);
                });
            } catch (err) {
                if (!this.isRunning) break;
                console.error("[HttpServer] Error accepting connection:", err);
            }
        }
    }

    /**
     * Stops the server from accepting further connections.
     */
    public close(): void {
        this.isRunning = false;
    }
}
