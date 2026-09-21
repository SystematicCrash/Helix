import TCPServer from "../../tcp/server/TCPServer.js";
import { HttpConnection } from "./HttpConnection.js";
import {ServerInfo} from "../../../common/types.js";

export default class HttpServer {
    private _info: ServerInfo | null = null;
    private isRunning = false;

    constructor(private tcpServer: TCPServer) {}

    get info(): ServerInfo | null {
        return this._info;
    }

    /**
     * Starts the HTTP server listening on the specified port.
     * @param port - The TCP port to listen on.
     */
    public async listen(port: number): Promise<void> {
        this.tcpServer.listen(port);
        const addr = this.tcpServer.address();

        this._info = {
            port,
            iface: addr?.address ?? "0.0.0.0",
            version: "1.0.0", // TODO: read version from package.json
        };

        this.isRunning = true;

        while (this.isRunning) {
            try {
                const conn = await this.tcpServer.accept();
                const httpConn = new HttpConnection(conn, this._info!);
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
