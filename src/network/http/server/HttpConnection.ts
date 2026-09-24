import {TCPConnection} from "../../tcp/index.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import HttpRequest from "../request/HttpRequest.js";
import HttpResponse from "../response/HttpResponse.js";
import {HttpBody} from "../body/HttpBody.js";
import {parseRequest} from "../request/parser/parseRequest.js";
import {handleRequest} from "../request/handleRequest.js";
import {ResponseWriter} from "../response/ResponseWriter.js";
import {mapErrorToResponse} from "../response/mapErrorToResponse.js";
import {mapToHttpError} from "../common/mappers.js";
import HttpError from "../common/HttpError.js";
import {HttpHeader, HttpMethod} from "../common/constants.js";
import type {RouteTree} from "../routing/buildTree.js";

export class HttpConnection {
    private buf = new DynamicBuffer();

    constructor(private conn: TCPConnection, private tree: RouteTree) {}

    /** Handles the client connection lifecycle, processing requests until EOF. */
    public async handle(): Promise<void> {
        try {
            while (true) {
                const keepAlive = await this.processRequest();
                if (!keepAlive) break;
            }
        } finally {
            await this.conn.close();
        }
    }

    /**
     * Checks connection state and safely serializes the HTTP response to the wire.
     * Returns false if the socket is already closed, errored, or if the write fails.
     */
    public async writeResponse(response: HttpResponse): Promise<boolean> {
        if (!this.conn.isWritable) return false;

        try {
            await ResponseWriter.write(this.conn, response);
            return true;
        } catch {
            return false;
        }
    }

    /** Processes a single HTTP request and returns true if the connection should stay open. */
    private async processRequest(): Promise<boolean> {
        let body: HttpBody | null = null;
        let request: HttpRequest | null = null;

        try {
            request = await this.readNextRequest();
            if (!request) return false;

            body = request.getBody(this.conn, this.buf);
            const result = this.tree.lookup(request.method as HttpMethod, request.url);
            const response = await handleRequest(request, body, result);

            const written = await this.writeResponse(response);
            if (!written) return false;

            await this.drainBody(body);

            return this.shouldKeepAlive(request, response);
        } catch (error: unknown) {
            return await this.handleError(error, body, request);
        }
    }

    /** Reads and parses the next incoming HTTP request from the connection. */
    private async readNextRequest(): Promise<HttpRequest | null> {
        let request = parseRequest(this.buf);
        while (!request) {
            const data = await this.conn.read();
            if (data === null) {
                if (this.buf.length === 0) return null;
                throw HttpError.badRequest("Unexpected EOF", true);
            }
            this.buf.push(data);
            request = parseRequest(this.buf);
        }
        return request;
    }

    /** Drains any remaining unread bytes from the request body stream. */
    private async drainBody(body: HttpBody): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
        }
    }

    /** Normalizes errors and sends an appropriate HTTP response if the socket is alive. */
    private async handleError(
        error: unknown,
        body: HttpBody | null,
        request: HttpRequest | null,
    ): Promise<boolean> {
        try {
            if (this.conn.isFullyClosed || this.conn.error !== null) {
                return false;
            }

            const httpErr = mapToHttpError(error);
            const response = mapErrorToResponse(httpErr, request);

            const written = await this.writeResponse(response);
            if (!written) return false;

            const keepAlive = !httpErr.fatal && this.shouldKeepAlive(request, response);

            if (keepAlive && body) {
                await this.drainBody(body);
            }

            return keepAlive;
        } catch {
            return false;
        }
    }

    /** Determines if the connection should remain open based on request and response framing headers. */
    private shouldKeepAlive(request: HttpRequest | null, response: HttpResponse): boolean {
        if (!request) return false;

        const clientClose = request.headers.get(HttpHeader.Connection)?.toLowerCase() === "close";
        const serverClose = response.getHeader(HttpHeader.Connection)?.toLowerCase() === "close";

        return !clientClose && !serverClose;
    }
}