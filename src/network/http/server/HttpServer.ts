import { ServerInfo } from "../../../server/ServerInfo.js";
import TCPServer from "../../tcp/server/TCPServer.js";
import { TCPConnection } from "../../tcp/index.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import HttpRequest from "../request/HttpRequest.js";
import HttpError from "../common/HttpError.js";
import { handleRequest } from "../request/RequestRouter.js";
import { ResponseWriter } from "../response/ResponseWriter.js";
import { mapErrorToResponse } from "../response/mapErrorToResponse.js";
import { mapToHttpError } from "../common/mappers.js";
import { parseRequest } from "../request/parser/parseRequest.js";
import { HttpBody } from "../body/HttpBody.js";
import {HttpHeader} from "../common/constants.js";

export default class HttpServer {
    private _info: ServerInfo | null = null;
    private isRunning = false;

    constructor(private tcpServer: TCPServer) {}

    get info(): ServerInfo | null {
        return this._info;
    }

    /**
     * Starts the HTTP server listening on the specified port.
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
                this.serveClient(conn).catch((err) => {
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

    /**
     * Handles the lifecycle of a client connection, processing HTTP requests until EOF.
     */
    private async serveClient(conn: TCPConnection): Promise<void> {
        const buf = new DynamicBuffer();

        try {
            while (true) {
                const keepAlive = await this.handleRequest(conn, buf);
                if (!keepAlive) break;
            }
        } finally {
            await conn.close();
        }
    }

    private async handleRequest(conn: TCPConnection, buf: DynamicBuffer): Promise<boolean> {
        let request: HttpRequest | null = null;
        let body: HttpBody | null = null;
        try {
            request = await this.readNextRequest(conn, buf);
            if (!request) return false;

            body = request.getBody(conn, buf);
            const response = await handleRequest(request, body, this._info!);
            await ResponseWriter.write(conn, response);

            await this.drainBody(body);
            return !this.clientWantsClose(request);
        } catch (error: unknown) {
            return await this.handleError(conn, error, body, request);
        }
    }

    /**
     * Reads chunks from the connection into the sliding buffer until
     * a complete HTTP request head can be parsed.
     * Returns `null` on clean client-initiated EOF.
     */
    private async readNextRequest(conn: TCPConnection, buf: DynamicBuffer): Promise<HttpRequest | null> {
        let request = parseRequest(buf);

        while (!request) {
            const data = await conn.read();

            if (data === null) {
                if (buf.length === 0) return null;
                throw HttpError.badRequest("Unexpected EOF", true);
            }

            buf.push(data);
            request = parseRequest(buf);
        }

        return request;
    }

    /**
     * Drains any remaining payload bytes if the handler did not consume the full body.
     */
    private async drainBody(body: HttpBody): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
        }
    }

    /**
     * Normalizes errors, renders the corresponding response, and ensures the socket closes.
     */
    private async handleError(conn: TCPConnection, error: unknown, body: HttpBody | null, request: HttpRequest | null): Promise<boolean> {
        try {
            const httpErr = mapToHttpError(error);
            const response = mapErrorToResponse(httpErr, this._info!, request);
            await ResponseWriter.write(conn, response);

            body && await this.drainBody(body);
            return !httpErr.fatal && !this.clientWantsClose(request);
        } catch {
            return false;
        }
    }

    private clientWantsClose(request: HttpRequest | null): boolean {
        return request === null || request.headers.get(HttpHeader.Connection)?.toLowerCase() === 'close';
    }
}