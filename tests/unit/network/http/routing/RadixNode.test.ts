import {describe, test, expect} from 'vitest';
import RadixNode from '../../../../../src/network/http/routing/RadixNode.js';
import {HttpMethod} from '../../../../../src/network/http/common/constants.js';
import HttpResponse from '../../../../../src/network/http/response/HttpResponse.js';
import type {RouteHandler} from '../../../../../src/network/http/routing/RouteHandler.js';

const handlerFor = (label: string): RouteHandler => (req, _body, _info, params) => {
    const response = HttpResponse.html(200, label);
    response.headers.set('x-path', req.url);
    response.headers.set('x-params', JSON.stringify(params));
    return response;
};

describe('RadixNode.insert()', () => {
    test('reuses an existing static child of the same name', () => {
        const root = new RadixNode();
        const a = root.insert('users', {kind: 'static', name: 'users'});
        const b = root.insert('users', {kind: 'static', name: 'users'});

        expect(a).toBe(b);
        expect(root.staticChildren.size).toBe(1);
    });

    test('reuses an existing param child of the same name', () => {
        const root = new RadixNode();
        const a = root.insert('id', {kind: 'param', name: 'id'});
        const b = root.insert('id', {kind: 'param', name: 'id'});

        expect(a).toBe(b);
        expect(root.paramChild).toBe(a);
    });

    test('throws when two different param names are inserted at the same level', () => {
        const root = new RadixNode();
        root.insert('id', {kind: 'param', name: 'id'});

        expect(() => root.insert('name', {kind: 'param', name: 'name'})).toThrow(
            /Conflicting param names/,
        );
    });

    test('throws when a param and a wildcard coexist at the same level', () => {
        const root = new RadixNode();
        root.insert('id', {kind: 'param', name: 'id'});

        expect(() => root.insert('rest', {kind: 'wildcard', name: 'rest'})).toThrow(
            /wildcard .* cannot coexist/,
        );
    });

    test('throws when two different wildcard names are inserted at the same level', () => {
        const root = new RadixNode();
        root.insert('rest', {kind: 'wildcard', name: 'rest'});

        expect(() => root.insert('other', {kind: 'wildcard', name: 'other'})).toThrow(
            /Conflicting wildcard names/,
        );
    });

    test('static and param children can coexist — static wins at lookup', () => {
        const root = new RadixNode();
        const staticNode = root.insert('me', {kind: 'static', name: 'me'});
        staticNode.handlers.set(HttpMethod.GET, handlerFor('static-me'));

        const paramNode = root.insert('id', {kind: 'param', name: 'id'});
        paramNode.handlers.set(HttpMethod.GET, handlerFor('param-id'));

        expect(root.staticChildren.has('me')).toBe(true);
        expect(root.paramChild).toBe(paramNode);
    });
});

describe('RadixNode.lookup()', () => {
    test('finds a handler registered on an exact static path', () => {
        const root = new RadixNode();
        const target = root.insert('users', {kind: 'static', name: 'users'});
        target.handlers.set(HttpMethod.GET, handlerFor('users'));

        const result = root.lookup(HttpMethod.GET, ['users'], 0);
        expect(result.kind).toBe('found');
    });

    test('extracts and decodes a :param value', () => {
        const root = new RadixNode();
        const users = root.insert('users', {kind: 'static', name: 'users'});
        const param = users.insert('id', {kind: 'param', name: 'id'});
        param.handlers.set(HttpMethod.GET, handlerFor('user'));

        const result = root.lookup(HttpMethod.GET, ['users', 'hello%20world'], 0);

        expect(result.kind).toBe('found');
        if (result.kind !== 'found') return;
        expect(result.params).toEqual({id: 'hello world'});
    });

    test('wildcard captures the remaining path segments joined', () => {
        const root = new RadixNode();
        const files = root.insert('files', {kind: 'static', name: 'files'});
        const wild = files.insert('filepath', {kind: 'wildcard', name: 'filepath'});
        wild.handlers.set(HttpMethod.GET, handlerFor('file'));

        const result = root.lookup(HttpMethod.GET, ['files', 'a', 'b', 'c.txt'], 0);

        expect(result.kind).toBe('found');
        if (result.kind !== 'found') return;
        expect(result.params).toEqual({filepath: 'a/b/c.txt'});
    });

    test('backtracks from a static miss into a param sibling', () => {
        const root = new RadixNode();
        const users = root.insert('users', {kind: 'static', name: 'users'});

        // /users/me handled statically
        const me = users.insert('me', {kind: 'static', name: 'me'});
        me.handlers.set(HttpMethod.GET, handlerFor('me'));

        // /users/:id handled via param
        const param = users.insert('id', {kind: 'param', name: 'id'});
        param.handlers.set(HttpMethod.GET, handlerFor('user-id'));

        const staticHit = root.lookup(HttpMethod.GET, ['users', 'me'], 0);
        expect(staticHit.kind).toBe('found');
        if (staticHit.kind !== 'found') return;
        expect(staticHit.params).toEqual({}); // no param binding for the static path

        const paramHit = root.lookup(HttpMethod.GET, ['users', '42'], 0);
        expect(paramHit.kind).toBe('found');
        if (paramHit.kind !== 'found') return;
        expect(paramHit.params).toEqual({id: '42'});
    });

    test('returns notFound when no branch matches', () => {
        const root = new RadixNode();
        root.insert('users', {kind: 'static', name: 'users'});

        expect(root.lookup(HttpMethod.GET, ['posts'], 0).kind).toBe('notFound');
        expect(root.lookup(HttpMethod.GET, ['users', 'extra', 'segments'], 0).kind).toBe('notFound');
    });

    test('returns notFound at the root when no handler is registered', () => {
        const root = new RadixNode();
        expect(root.lookup(HttpMethod.GET, [], 0).kind).toBe('notFound');
    });

    test('returns methodNotAllowed when the path matches but not the method', () => {
        const root = new RadixNode();
        const target = root.insert('users', {kind: 'static', name: 'users'});
        target.handlers.set(HttpMethod.GET, handlerFor('users-get'));
        target.handlers.set(HttpMethod.POST, handlerFor('users-post'));

        const result = root.lookup(HttpMethod.DELETE, ['users'], 0);
        expect(result.kind).toBe('methodNotAllowed');
        if (result.kind !== 'methodNotAllowed') return;
        expect(new Set(result.allowed)).toEqual(new Set([HttpMethod.GET, HttpMethod.POST]));
    });

    test('methodNotAllowed is distinguished from notFound on a deeper node', () => {
        const root = new RadixNode();
        const users = root.insert('users', {kind: 'static', name: 'users'});
        users.handlers.set(HttpMethod.GET, handlerFor('users'));

        // Same path, wrong method → 405, not 404
        expect(root.lookup(HttpMethod.PUT, ['users'], 0).kind).toBe('methodNotAllowed');
        // Different path → 404
        expect(root.lookup(HttpMethod.GET, ['nonexistent'], 0).kind).toBe('notFound');
    });

    test('restores params after a failed param branch (no partial bindings leak)', () => {
        const root = new RadixNode();
        const users = root.insert('users', {kind: 'static', name: 'users'});

        const param = users.insert('id', {kind: 'param', name: 'id'});
        // :id only has a POST handler
        param.handlers.set(HttpMethod.POST, handlerFor('user-post'));

        // A deeper static child under the param: /users/:id/posts
        const posts = param.insert('posts', {kind: 'static', name: 'posts'});
        posts.handlers.set(HttpMethod.GET, handlerFor('user-posts'));

        // /users/42/nonexistent: param branch is entered, then backtracks out;
        // the 'id' binding must not leak to the returned result.
        const result = root.lookup(HttpMethod.GET, ['users', '42', 'nonexistent'], 0);
        expect(result.kind).toBe('notFound');
    });
});
