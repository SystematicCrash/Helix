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

export default class HttpServer {
    private _info: ServerInfo | null = null;
    private isRunning = false;

    constructor(private tcpServer: TCPServer) {}

    get info(): ServerInfo | null {
        return this._info;
    }

    public async listen(port: number): Promise<void> {
        this.tcpServer.listen(port);
        const addr = this.tcpServer.address();

        this._info = {
            port,
            iFace: addr?.address ?? "0.0.0.0",
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

    public close(): void {
        this.isRunning = false;
    }

    private async serveClient(conn: TCPConnection): Promise<void> {
        const buf = new DynamicBuffer();
        let request: HttpRequest | null = null;

        try {
            while (true) {
                request = await this.readNextRequest(conn, buf);
                if (!request) return;

                const body = request.getBody(conn, buf);
                const response = await handleRequest(request, body, this._info!);
                await ResponseWriter.write(conn, response);

                await this.drainBody(body);
                request = null;
            }
        } catch (error: unknown) {
            await this.handleError(conn, error, request);
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
                if (buf.length === 0) {
                    await conn.close();
                    return null;
                }
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
    private async handleError(conn: TCPConnection, error: unknown, request: HttpRequest | null): Promise<void> {
        try {
            const httpErr = mapToHttpError(error);
            const response = mapErrorToResponse(httpErr, request, this._info);
            await ResponseWriter.write(conn, response);
        } catch {}
        finally {
            await conn.close();
        }
    }
}