import {serveStaticFile} from "../../../fs/index.js";
import {HttpBody} from "../body/HttpBody.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";
import HttpError from "../common/HttpError.js";
import FsError from "../../../fs/common/FsError.js";
import {FsErrCode} from "../../../fs/index.js";
import MemoryBody from "../body/MemoryBody.js";
import StreamBody from "../body/StreamBody.js";
import {HttpHeader} from "../common/constants.js";
import HttpRequest from "./HttpRequest.js";
import HttpResponse from "../response/HttpResponse.js";

/**
 * Routes the request to the appropriate handler and returns an HTTP response.
 */
export async function handleRequest(request: HttpRequest, body: HttpBody, info: ServerInfo): Promise<HttpResponse> {
    let payload: HttpBody;
    let statusCode: number = 200;
    const headers = new Map<string, string>();

    if (request.url.startsWith('/files')) {
        const fileUrl = request.url.slice('/files'.length) || '/';
        const file = await serveStaticFile(fileUrl, request.rangeSet ?? []);

        payload = new StreamBody(file.stream, file.size);
        statusCode = file.status;

        headers.set(HttpHeader.AcceptRange, 'bytes');
        if (file.contentRange) {
            headers.set('content-range', file.contentRange);
        }

    } else if (request.url === '/' || request.url === '/index.html') {
        const html = renderHtml('index', {
            version: info.version,
            interface: info.iFace,
            port: info.port,
        });
        payload = new MemoryBody(html);
    } else {
        switch (request.url) {
            case '/echo':
                payload = body;
                break;
            default:
                throw HttpError.notFound();
        }
    }

    const response = HttpResponse.from(statusCode, payload);
    response.setHeaders(headers);
    return response;
}
