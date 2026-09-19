import {HttpResponse} from "../common/types.js";
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

type BufferGenerator = AsyncGenerator<Buffer, void, void>;

async function* countSheep(): BufferGenerator {
    for (let i = 1; i <= 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield Buffer.from(`count: ${i}\n`);
    }
}

/**
 * Maps a filesystem NOT_FOUND to an HttpError(404) so the error pipeline can
 * render the not-found page. Any other filesystem error is rethrown as-is and
 * surfaces as a 500.
 */
function rethrowFsNotFound(err: unknown): never {
    if (err instanceof FsError && FsError.is(err, FsErrCode.NOT_FOUND)) {
        throw new HttpError(404, 'Resource not found');
    }
    throw err;
}

/**
 * Routes the request to the appropriate handler and returns an HTTP response.
 */
export async function handleRequest(request: HttpRequest, body: HttpBody, info: ServerInfo): Promise<HttpResponse> {
    let payload: HttpBody;
    let statusCode: number = 200;
    const headers = new Map<string, string>();

    if (request.url.startsWith('/files')) {
        const fileUrl = request.url.slice('/files'.length) || '/';
        try {
            const file = await serveStaticFile(fileUrl, request.rangeSet ?? []);

            payload = new StreamBody(file.stream, file.size);
            statusCode = file.status;

            headers.set(HttpHeader.AcceptRange, 'bytes');
            if (file.contentRange) {
                headers.set('content-range', file.contentRange);
            }
        } catch (err) {
            rethrowFsNotFound(err);
        }
    } else if (request.url === '/' || request.url === '/index.html') {
        const html = renderHtml('index', {
            version: info.version,
            interface: info.iface,
            port: info.port,
        });
        payload = new MemoryBody(html);
    } else {
        switch (request.url) {
            case '/echo':
                payload = body;
                break;
            case '/sheep':
                payload = new StreamBody(countSheep());
                break;
            default:
                throw new HttpError(404, 'Resource not found');
        }
    }

    return {
        code: statusCode,
        version: request.version,
        headers,
        body: payload,
    };
}
