import {describe, test, expect} from 'vitest';
import {handleRequest} from '../../../../../src/network/http/request/RequestRouter.js';
import Router from '../../../../../src/network/http/routing/Router.js';
import HttpResponse from '../../../../../src/network/http/response/HttpResponse.js';
import HttpRequest from '../../../../../src/network/http/request/HttpRequest.js';
import EmptyBody from '../../../../../src/network/http/body/EmptyBody.js';
import {HttpHeader} from '../../../../../src/network/http/common/constants.js';
import type {ServerInfo} from '../../../../../src/common/types.js';
import type {HttpBody} from '../../../../../src/network/http/body/HttpBody.js';
import type {RouteHandler} from '../../../../../src/network/http/routing/RouteHandler.js';

const info: ServerInfo = {port: 1234, iface: '127.0.0.1', version: '1.0.0'};
const body: HttpBody = new EmptyBody();

const requestFor = (method: string, url: string): HttpRequest =>
    HttpRequest.from(Buffer.from(`${method} ${url} HTTP/1.1\r\nHost: localhost\r\n\r\n`));

const handler = (label: string): RouteHandler => (_req, _body, _info, params) => {
    const response = HttpResponse.html(200, label);
    response.headers.set('x-params', JSON.stringify(params));
    return response;
};

const buildTestTree = (): ReturnType<Router['build']> => {
    const router = new Router();
    router.get('/', handler('root'));
    router.get('/echo', handler('echo'));
    router.get('/users/:id', handler('user-by-id'));
    router.get('/users/me', handler('me'));
    router.post('/users', handler('create-user'));
    router.get('/files/*filepath', handler('file'));
    router.group('/api').get('/ping', handler('api-ping'));
    return router.build();
};

describe('handleRequest — found', () => {
    test('dispatches a static route and returns the handler response', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(requestFor('GET', '/echo'), body, info, tree);
        const text = await readResponseText(response);

        expect(response.code).toBe(200);
        expect(text).toBe('echo');
    });

    test('dispatches a root path', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(requestFor('GET', '/'), body, info, tree);
        const text = await readResponseText(response);

        expect(response.code).toBe(200);
        expect(text).toBe('root');
    });

    test('static child takes precedence over a param sibling', async () => {
        const tree = buildTestTree();
        const meResponse = await handleRequest(requestFor('GET', '/users/me'), body, info, tree);
        const idResponse = await handleRequest(requestFor('GET', '/users/42'), body, info, tree);

        expect(await readResponseText(meResponse)).toBe('me');
        expect(await readResponseText(idResponse)).toBe('user-by-id');

        const params = idResponse.headers.get('x-params');
        expect(JSON.parse(params ?? '{}')).toEqual({id: '42'});
    });

    test('routes inside a group resolve with the joined prefix', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(requestFor('GET', '/api/ping'), body, info, tree);

        expect(response.code).toBe(200);
        expect(await readResponseText(response)).toBe('api-ping');
    });

    test('wildcard route captures the remaining path', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(
            requestFor('GET', '/files/docs/readme.md'),
            body,
            info,
            tree,
        );

        expect(response.code).toBe(200);
        const params = JSON.parse(response.headers.get('x-params') ?? '{}');
        expect(params).toEqual({filepath: 'docs/readme.md'});
    });
});

describe('handleRequest — methodNotAllowed', () => {
    test('returns 405 and an Allow header listing every registered method', async () => {
        const router = new Router();
        router.get('/only-get', handler('get-only'));
        router.post('/only-get', handler('post-too'));
        const tree = router.build();

        const response = await handleRequest(
            requestFor('DELETE', '/only-get'),
            body,
            info,
            tree,
        );

        expect(response.code).toBe(405);
        expect(response.headers.get(HttpHeader.Allow)).toBe('GET, POST');
    });

    test('405 on one path does not bleed into an unrelated 404', async () => {
        const router = new Router();
        router.get('/exists', handler('exists'));
        const tree = router.build();

        expect(
            (await handleRequest(requestFor('POST', '/exists'), body, info, tree)).code,
        ).toBe(405);
        expect(
            (await handleRequest(requestFor('POST', '/missing'), body, info, tree)).code,
        ).toBe(404);
    });
});

describe('handleRequest — notFound', () => {
    test('returns 404 for an unregistered path', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(requestFor('GET', '/nowhere'), body, info, tree);

        expect(response.code).toBe(404);
    });

    test('returns 404 when a deeper path is missing beyond a matched prefix', async () => {
        const tree = buildTestTree();
        const response = await handleRequest(
            requestFor('GET', '/users/42/nonexistent'),
            body,
            info,
            tree,
        );

        expect(response.code).toBe(404);
    });
});

describe('handleRequest — handler errors propagate', () => {
    test('a throwing handler bubbles up for the per-connection error path', async () => {
        const router = new Router();
        router.get('/boom', () => {
            throw new Error('kaboom');
        });
        const tree = router.build();

        await expect(
            handleRequest(requestFor('GET', '/boom'), body, info, tree),
        ).rejects.toThrow('kaboom');
    });
});

/** Small helper: drains an HttpResponse body into text so tests can assert on it. */
async function readResponseText(response: HttpResponse): Promise<string> {
    const chunks: Buffer[] = [];
    while (true) {
        const chunk = await response.body.read();
        if (chunk === null) break;
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
}
