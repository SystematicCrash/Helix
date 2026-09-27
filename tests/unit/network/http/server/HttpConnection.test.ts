import {describe, test, expect, beforeEach, beforeAll, vi, type Mock} from 'vitest';
import {HttpConnection} from '../../../../../src/network/http/server/HttpConnection.js';
import {TCPConnection} from '../../../../../src/network/tcp/index.js';
import Router from '../../../../../src/network/http/routing/Router.js';
import HttpResponse from '../../../../../src/network/http/response/HttpResponse.js';
import {HttpHeader, HttpMethod} from '../../../../../src/network/http/common/constants.js';
import HttpError from '../../../../../src/network/http/common/HttpError.js';
import TCPError from '../../../../../src/network/tcp/common/TCPError.js';
import {setServerInfo} from '../../../../../src/common/serverInfo.js';
import type {ServerInfo} from '../../../../../src/common/types.js';
import type {RouteTree} from '../../../../../src/network/http/routing/buildTree.js';
import type {RouteHandler} from '../../../../../src/network/http/routing/types.js';

// Override MAX_REQUEST_COUNT so keep-alive boundary tests can run in unit-time.
vi.mock('../../../../../src/network/http/common/constants.js', async () => {
    const actual = await vi.importActual<typeof import('../../../../../src/network/http/common/constants.js')>(
        '../../../../../src/network/http/common/constants.js',
    );
    return {...actual, MAX_REQUEST_COUNT: 3};
});

const MOCK_SERVER_INFO: ServerInfo = {
    port: 1234,
    iface: '127.0.0.1',
    version: '1.0.0',
};

beforeAll(() => {
    try {
        setServerInfo(MOCK_SERVER_INFO);
    } catch {
        // Already initialized by another suite.
    }
});

/**
 * Fake TCPConnection that exposes controllable getters and a queued read pipeline.
 * Mirrors the surface HttpConnection uses (read/write/flush/close/stream + isWritable/isFullyClosed/error).
 */
interface FakeConnection extends TCPConnection {
    read: Mock<[], Promise<Buffer | null>>;
    write: Mock<[Buffer], Promise<void>>;
    flush: Mock<[], Promise<void>>;
    close: Mock<[], Promise<void>>;
    setWritable: (v: boolean) => void;
    setFullyClosed: (v: boolean) => void;
    setError: (e: TCPError | null) => void;
    enqueueReads: (...buffers: (Buffer | null)[]) => void;
    setWriteImpl: (fn: (data: Buffer) => Promise<void>) => void;
}

function createFakeConnection(): FakeConnection {
    let writable = true;
    let fullyClosed = false;
    let connError: TCPError | null = null;
    const reads: Array<Buffer | null> = [];
    let writeImpl: (data: Buffer) => Promise<void> = () => Promise.resolve();

    const conn: any = {
        read: vi.fn().mockImplementation(() => {
            const next = reads.shift();
            return Promise.resolve(next === undefined ? null : next);
        }),
        write: vi.fn().mockImplementation((data: Buffer) => writeImpl(data)),
        flush: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        socket: {},
        stream: vi.fn().mockImplementation(() => ({
            [Symbol.asyncIterator]: async function* () {
                while (true) {
                    const v = reads.shift();
                    if (v === undefined || v === null) break;
                    yield v;
                }
            },
        })),
        get isWritable() { return writable; },
        get isFullyClosed() { return fullyClosed; },
        get error() { return connError; },
        get isReadable() { return true; },
        setWritable(v: boolean) { writable = v; },
        setFullyClosed(v: boolean) { fullyClosed = v; },
        setError(e: TCPError | null) { connError = e; },
        enqueueReads(...buffers: (Buffer | null)[]) { reads.push(...buffers); },
        setWriteImpl(fn: (data: Buffer) => Promise<void>) { writeImpl = fn; },
    };

    return conn as FakeConnection;
}

/** Build a complete HTTP/1.1 request buffer with the given headers. */
function makeRequest(
    method: string,
    url: string,
    extraHeaders: Record<string, string> = {},
): Buffer {
    const lines = [
        `${method} ${url} HTTP/1.1`,
        'Host: localhost',
        ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    ];
    return Buffer.from(lines.join('\r\n') + '\r\n\r\n');
}

/** Concatenate every byte written to the fake connection into a single Buffer. */
function wireOf(conn: FakeConnection): Buffer {
    return Buffer.concat(
        (conn.write as Mock).mock.calls.map(([b]: [Buffer]) => b),
    );
}

/**
 * Build a real RouteTree with optional handler overrides. Defaults route every method
 * to a noop text response so tests can focus on HttpConnection's wrapping behavior.
 */
function buildTree(handlers: Partial<Record<string, RouteHandler>> = {}): RouteTree {
    const router = new Router();
    const register = (method: HttpMethod, path: string, label: string) => {
        const key = `${method} ${path}`;
        const handler: RouteHandler = handlers[key] ?? (() => HttpResponse.text(200, label));
        switch (method) {
            case HttpMethod.GET:    router.get(path, handler); break;
            case HttpMethod.POST:   router.post(path, handler); break;
            case HttpMethod.PUT:    router.put(path, handler); break;
            case HttpMethod.DELETE: router.delete(path, handler); break;
            case HttpMethod.PATCH:  router.patch(path, handler); break;
            case HttpMethod.HEAD:   router.head(path, handler); break;
            case HttpMethod.OPTIONS:router.options(path, handler); break;
        }
    };
    register(HttpMethod.GET, '/', 'home');
    register(HttpMethod.GET, '/hello', 'hello');
    register(HttpMethod.POST, '/echo', 'echo');
    if (handlers['GET /error']) register(HttpMethod.GET, '/error', 'error');
    return router.build();
}

describe('HttpConnection.writeResponse', () => {
    let conn: FakeConnection;
    let httpConn: HttpConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
        httpConn = new HttpConnection(conn, tree);
    });

    test('returns true and writes+flushes when conn is writable', async () => {
        const response = HttpResponse.text(200, 'hi');

        const result = await httpConn.writeResponse(response);

        expect(result).toBe(true);
        expect(conn.write).toHaveBeenCalled();
        expect(conn.flush).toHaveBeenCalledTimes(1);
    });

    test('returns false and writes nothing when conn is not writable', async () => {
        conn.setWritable(false);
        const response = HttpResponse.text(200, 'hi');

        const result = await httpConn.writeResponse(response);

        expect(result).toBe(false);
        expect(conn.write).not.toHaveBeenCalled();
        expect(conn.flush).not.toHaveBeenCalled();
    });

    test('returns false when the underlying writer throws', async () => {
        conn.setWriteImpl(() => Promise.reject(new Error('socket write failed')));

        const result = await httpConn.writeResponse(HttpResponse.text(200, 'hi'));

        expect(result).toBe(false);
    });

    test('flushes exactly once per response regardless of body size', async () => {
        const response = HttpResponse.text(200, 'hello world');

        await httpConn.writeResponse(response);

        expect(conn.flush).toHaveBeenCalledTimes(1);
        // 1 write for headers + 1 write for the body chunk
        expect(conn.write).toHaveBeenCalledTimes(2);
    });
});

describe('HttpConnection.handle — connection lifecycle', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('closes the connection after a clean EOF', async () => {
        conn.enqueueReads(null);
        await new HttpConnection(conn, tree).handle();

        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('closes the connection in finally when writing fails mid-request', async () => {
        conn.enqueueReads(makeRequest('GET', '/'), null);
        conn.setWriteImpl(() => Promise.reject(new Error('write failed')));
        await new HttpConnection(conn, tree).handle();

        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('writes no response when EOF arrives before any bytes', async () => {
        conn.enqueueReads(null);
        await new HttpConnection(conn, tree).handle();

        expect(conn.write).not.toHaveBeenCalled();
        expect(conn.flush).not.toHaveBeenCalled();
    });
});

describe('HttpConnection.handle — single request processing', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('processes a complete request and flushes exactly one response', async () => {
        conn.enqueueReads(makeRequest('GET', '/hello'), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(1);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('dispatches GET to the matching route', async () => {
        conn.enqueueReads(makeRequest('GET', '/hello'), null);

        await new HttpConnection(conn, tree).handle();

        expect(wireOf(conn).toString('ascii')).toContain('200');
    });

    test('returns 404 when no route matches', async () => {
        conn.enqueueReads(makeRequest('GET', '/no-such-route'), null);

        await new HttpConnection(conn, tree).handle();

        expect(wireOf(conn).toString('ascii')).toContain('404');
    });

    test('returns 405 with an Allow header when method is not allowed', async () => {
        conn.enqueueReads(makeRequest('DELETE', '/hello'), null);

        await new HttpConnection(conn, tree).handle();

        const wire = wireOf(conn).toString('ascii');
        expect(wire).toContain('405');
        expect(wire).toMatch(/Allow:\s*GET/i);
    });

    test('dispatches POST correctly', async () => {
        conn.enqueueReads(makeRequest('POST', '/echo'), null);

        await new HttpConnection(conn, tree).handle();

        expect(wireOf(conn).toString('ascii')).toContain('200');
    });
});

describe('HttpConnection.handle — keep-alive', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('serves multiple requests in sequence on one connection', async () => {
        conn.enqueueReads(
            makeRequest('GET', '/hello'),
            makeRequest('GET', '/'),
            makeRequest('GET', '/hello'),
            null,
        );

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(3);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('closes the connection when the client sends Connection: close', async () => {
        conn.enqueueReads(makeRequest('GET', '/hello', {Connection: 'close'}), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(1);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('closes the connection when the handler sets Connection: close on its response', async () => {
        tree = buildTree({
            'GET /hello': () => {
                const res = HttpResponse.text(200, 'hi');
                res.setHeader(HttpHeader.Connection, 'close');
                return res;
            },
        });
        conn.enqueueReads(makeRequest('GET', '/hello'), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(1);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('closes the connection after MAX_REQUEST_COUNT requests (mocked to 3)', async () => {
        conn.enqueueReads(
            makeRequest('GET', '/hello'),
            makeRequest('GET', '/hello'),
            makeRequest('GET', '/hello'),
            null,
        );

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(3);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('keeps the connection open when serving fewer than MAX_REQUEST_COUNT requests', async () => {
        conn.enqueueReads(
            makeRequest('GET', '/hello'),
            makeRequest('GET', '/hello'),
            null,
        );

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(2);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('keeps reading when the first chunk carries only part of the headers', async () => {
        const full = makeRequest('GET', '/hello');
        const cut = Math.floor(full.length / 2);
        conn.enqueueReads(full.subarray(0, cut), full.subarray(cut), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(1);
        expect(conn.close).toHaveBeenCalledTimes(1);
    });
});

describe('HttpConnection.handle — readNextRequest EOF behavior', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('treats an empty buffer + null read as a clean client disconnect', async () => {
        conn.enqueueReads(null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.write).not.toHaveBeenCalled();
        expect(conn.flush).not.toHaveBeenCalled();
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('treats partial bytes + null read as a fatal bad request', async () => {
        // No terminator in the buffer, then EOF → HttpError("Unexpected EOF", fatal=true).
        conn.enqueueReads(Buffer.from('GET /partial'), null);

        await new HttpConnection(conn, tree).handle();

        const wire = wireOf(conn).toString('ascii');
        expect(wire).toContain('400');
        expect(wire).toMatch(/Connection:\s*close/i);
    });
});

describe('HttpConnection.handle — error handling', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('catches handler errors and serves a 500 response', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw new Error('handler boom');
            },
        });
        conn.enqueueReads(makeRequest('GET', '/error'), null);

        await new HttpConnection(conn, tree).handle();

        expect(wireOf(conn).toString('ascii')).toContain('500');
    });

    test('non-fatal HttpError from the handler keeps the connection alive', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw HttpError.notFound('not here');
            },
        });
        conn.enqueueReads(makeRequest('GET', '/error'), makeRequest('GET', '/hello'), null);

        await new HttpConnection(conn, tree).handle();

        // 1 error response + 1 successful response → 2 flushes.
        expect(conn.flush).toHaveBeenCalledTimes(2);
    });

    test('fatal HttpError from the handler marks the response and closes the connection', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw HttpError.contentTooLarge('too big');
            },
        });
        conn.enqueueReads(makeRequest('GET', '/error'), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).toHaveBeenCalledTimes(1);
        expect(conn.close).toHaveBeenCalledTimes(1);
        expect(wireOf(conn).toString('ascii')).toMatch(/Connection:\s*close/i);
    });

    test('does NOT send an error response when the connection is already fully closed', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw new Error('boom');
            },
        });
        conn.setFullyClosed(true);
        conn.enqueueReads(makeRequest('GET', '/error'), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.write).not.toHaveBeenCalled();
        expect(conn.flush).not.toHaveBeenCalled();
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('does NOT send an error response when the connection has a TCP error', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw new Error('boom');
            },
        });
        conn.setError(new TCPError(1, 'socket gone'));
        conn.enqueueReads(makeRequest('GET', '/error'), null);

        await new HttpConnection(conn, tree).handle();

        expect(conn.write).not.toHaveBeenCalled();
        expect(conn.flush).not.toHaveBeenCalled();
        expect(conn.close).toHaveBeenCalledTimes(1);
    });

    test('serves a 400 when the parser rejects the request line', async () => {
        // 'garbage' is not a valid request line → parseRequestLine → HttpError.invalidRequestLine().
        conn.enqueueReads(Buffer.from('garbage\r\n\r\n'), null);

        await new HttpConnection(conn, tree).handle();

        expect(wireOf(conn).toString('ascii')).toContain('400');
    });

    test('still closes the connection when the error response itself fails to write', async () => {
        tree = buildTree({
            'GET /error': () => {
                throw new Error('boom');
            },
        });
        conn.enqueueReads(makeRequest('GET', '/error'), null);
        conn.setWriteImpl(() => Promise.reject(new Error('write failed')));

        await new HttpConnection(conn, tree).handle();

        expect(conn.flush).not.toHaveBeenCalled();
        // close runs from the surrounding handle() finally block.
        expect(conn.close).toHaveBeenCalledTimes(1);
    });
});

describe('HttpConnection.handle — request body draining', () => {
    let conn: FakeConnection;
    let tree: RouteTree;

    beforeEach(() => {
        conn = createFakeConnection();
        tree = buildTree();
    });

    test('drains a Content-Length request body before reading the next request', async () => {
        const bodyText = 'hello body';
        const headers = makeRequest('POST', '/echo', {
            'Content-Length': bodyText.length.toString(),
        });
        conn.enqueueReads(headers, Buffer.from(bodyText), null);

        await new HttpConnection(conn, tree).handle();
        console.log('WIRE:\n' + wireOf(conn).toString('ascii'));
        expect(conn.flush).toHaveBeenCalledTimes(2);
        expect(conn.close).toHaveBeenCalledTimes(1);
        expect(conn.read).toHaveBeenCalled();
    });
});
