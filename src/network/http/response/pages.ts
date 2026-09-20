import HttpRequest from "../request/HttpRequest.js";
import {renderHtml} from "../../../infra/index.js";
import {ServerInfo} from "../../../server/ServerInfo.js";
import {HTTP_STATUS} from "../common/constants.js";

export function indexPage(info: ServerInfo): Buffer {
    return renderHtml('index', {
        version: info.version,
        interface: info.iFace,
        port: info.port,
    });
}

export function notFoundPage(request: HttpRequest | null, info: ServerInfo): Buffer {
    return renderHtml('notFound', {
        path: request?.url ?? '',
        method: request?.method ?? 'UNKNOWN',
        version: request?.version,
    });
}

export function internalErrorPage(status: number, request: HttpRequest | null, info: ServerInfo): Buffer {
    return renderHtml('internalError', {
        status,
        path: request?.url ?? '',
        method: request?.method ?? 'UNKNOWN',
        message: HTTP_STATUS[status],
        version: info.version
    });
}
