import { describe, test, expect } from 'vitest';
import EmptyBody from '../../../../src/network/http/body/EmptyBody.js';
import MemoryBody from '../../../../src/network/http/body/MemoryBody.js';
import StreamBody from '../../../../src/network/http/body/StreamBody.js';
import HttpResponse from '../../../../src/network/http/response/HttpResponse.js';

describe('new HttpResponse()', () => {
    test('stores the supplied code and body with HTTP/1.1 defaults and fresh headers', () => {
        const body = new EmptyBody();
        const response = new HttpResponse(200, body);

        expect(response.code).toBe(200);
        expect(response.body).toBe(body);
        expect(response.version).toBe('HTTP/1.1');
        expect(response.headers).toEqual(new Map());

        const otherResponse = new HttpResponse(200, new EmptyBody());
        expect(response.headers).not.toBe(otherResponse.headers);
    });

    test('stores an explicitly supplied HTTP version', () => {
        const response = new HttpResponse(204, new EmptyBody(), 'HTTP/1.0');

        expect(response.version).toBe('HTTP/1.0');
    });

    test('rejects status codes outside the HTTP status-code range', () => {
        const body = new EmptyBody();

        expect(() => new HttpResponse(99, body)).toThrow(RangeError);
        expect(() => new HttpResponse(600, body)).toThrow(RangeError);
    });

    test('rejects an empty HTTP version', () => {
        expect(() => new HttpResponse(200, new EmptyBody(), '')).toThrow(RangeError);
    });
});

describe('HttpResponse factories', () => {
    test('from returns an HttpResponse with the requested code', () => {
        const body = new EmptyBody();
        const response = HttpResponse.from(201, body);

        expect(response).toBeInstanceOf(HttpResponse);
        expect(response.code).toBe(201);
        expect(response.body).toBe(body);
    });

    test('html creates a UTF-8 HTML body and content type', () => {
        const html = '<h1/>';
        const response = HttpResponse.html(200, html);

        expect(response.body.length).toBe(Buffer.byteLength(html));
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    });

    test('html accepts a Buffer without changing its bytes', async () => {
        const bytes = Buffer.from('<h1/>');
        const response = HttpResponse.html(200, bytes);

        expect(await response.body.read()).toEqual(bytes);
    });

    test('json creates a JSON body and content type', async () => {
        const value = { a: 1 };
        const response = HttpResponse.json(200, value);

        expect(response.headers.get('content-type')).toBe('application/json');
        expect(await response.body.read()).toEqual(Buffer.from(JSON.stringify(value)));
    });

    test('empty creates an EmptyBody with zero content length', () => {
        const response = HttpResponse.empty(204);

        expect(response.body).toBeInstanceOf(EmptyBody);
        expect(response.contentLength).toBe(0);
    });

    test('redirect sets the location and creates a non-empty body', () => {
        const response = HttpResponse.redirect(302, '/x');

        expect(response.headers.get('location')).toBe('/x');
        expect(response.body.length).toBeGreaterThan(0);
    });
});

describe('HttpResponse mutators and derived values', () => {
    test('setHeader is chainable and updates header lookups', () => {
        const response = new HttpResponse(200, new EmptyBody());

        expect(response.setHeader('X', 'Y')).toBe(response);
        expect(response.hasHeader('X')).toBe(true);
        expect(response.getHeader('X')).toBe('Y');
    });

    test('setCode is chainable and updates the status code', () => {
        const response = new HttpResponse(200, new EmptyBody());

        expect(response.setCode(404)).toBe(response);
        expect(response.code).toBe(404);
    });

    test('setVersion is chainable and validates the version', () => {
        const response = new HttpResponse(200, new EmptyBody());

        expect(response.setVersion('HTTP/1.0')).toBe(response);
        expect(response.version).toBe('HTTP/1.0');
        expect(() => response.setVersion('')).toThrow(RangeError);
    });

    test('setBody is chainable and replaces the body', () => {
        const response = new HttpResponse(200, new EmptyBody());
        const body = new MemoryBody(Buffer.from('new body'));

        expect(response.setBody(body)).toBe(response);
        expect(response.body).toBe(body);
    });

    test('statusText resolves known codes and falls back to Unknown', () => {
        expect(new HttpResponse(200, new EmptyBody()).statusText).toBe('OK');
        expect(new HttpResponse(404, new EmptyBody()).statusText).toBe('Not Found');
        expect(new HttpResponse(599, new EmptyBody()).statusText).toBe('Unknown');
    });

    test('contentLength reflects known and unknown body lengths', () => {
        const knownBody = new MemoryBody(Buffer.from('known'));
        const knownResponse = new HttpResponse(200, knownBody);
        const unknownResponse = new HttpResponse(200, new StreamBody(async function* () {
            if (false) yield Buffer.alloc(0);
        }()));

        expect(knownResponse.contentLength).toBe(knownBody.length);
        expect(unknownResponse.contentLength).toBeNull();
    });
});
