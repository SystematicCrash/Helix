import { TCPConnection } from "../../tcp/index.js";
import DynamicBuffer from "../../../buffer/DynamicBuffer.js";
import HttpRequest from "../request/HttpRequest.js";
import { HttpBody } from "../body/HttpBody.js";
import { parseRequest } from "../request/parser/parseRequest.js";
import { handleRequest } from "../request/RequestRouter.js";
import { ResponseWriter } from "../response/ResponseWriter.js";
import { mapErrorToResponse } from "../response/mapErrorToResponse.js";
import { mapToHttpError } from "../common/mappers.js";
import HttpError from "../common/HttpError.js";
import { HttpHeader } from "../common/constants.js";
import {ServerInfo} from "../../../common/types.js";
import type {RouteTree} from "../routing/buildTree.js";

export class HttpConnection {
    private buf = new DynamicBuffer();

    constructor(
        private conn: TCPConnection,
        private info: ServerInfo,
        private tree: RouteTree,
    ) {}

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

    /** Processes a single HTTP request and returns true if the connection should stay open. */
    private async processRequest(): Promise<boolean> {
        let body: HttpBody | null = null;
        let request: HttpRequest | null = null;

        try {
            request = await this.readNextRequest();
            if (!request) return false;


            body = request.getBody(this.conn, this.buf);
            const response = await handleRequest(request, body, this.info, this.tree);
            await ResponseWriter.write(this.conn, response);

            await this.drainBody(body);
            return !this.clientWantsClose(request);
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

    /** Drains any remaining bytes from the request body stream. */
    private async drainBody(body: HttpBody): Promise<void> {
        while (true) {
            const chunk = await body.read();
            if (chunk === null) break;
        }
    }

    /** Normalizes errors and sends an appropriate HTTP response. */
    private async handleError(error: unknown, body: HttpBody | null, request: HttpRequest | null): Promise<boolean> {
        try {
            const httpErr = mapToHttpError(error);
            const response = mapErrorToResponse(httpErr, this.info, request);
            await ResponseWriter.write(this.conn, response);

            const keepAlive = !httpErr.fatal && !this.clientWantsClose(request);

            if (!httpErr.fatal && body) {
                await this.drainBody(body);
            }
            return keepAlive;
        } catch {
            return false;
        }
    }

    /** Checks if the client requested the connection to be closed. */
    private clientWantsClose(request: HttpRequest | null): boolean {
        return request === null || request.headers.get(HttpHeader.Connection)?.toLowerCase() === 'close';
    }
}
