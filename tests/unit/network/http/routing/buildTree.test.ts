import {describe, test, expect} from 'vitest';
import {buildTree, normalizePath, parseSegments} from '../../../../../src/network/http/routing/buildTree.js';
import Router from '../../../../../src/network/http/routing/Router.js';
import {HttpMethod} from '../../../../../src/network/http/common/constants.js';
import HttpResponse from '../../../../../src/network/http/response/HttpResponse.js';
import type {RouteHandler, RouteSpec} from '../../../../../src/network/http/routing/types.js';

const handler = (label = 'test'): RouteHandler => () => HttpResponse.html(200, label);

const spec = (path: string, method: HttpMethod = HttpMethod.GET): RouteSpec => ({
    path,
    methods: [method],
    handler: handler(`${method}-${path}`),
});

describe('normalizePath', () => {
    test.each([
        ['/', '/'],
        ['', '/'],
        ['/users', '/users'],
        ['/users/', '/users'],
        ['/users//', '/users'],
        ['/a/b/c/', '/a/b/c'],
    ])('%s → %s', (input, expected) => {
        expect(normalizePath(input)).toBe(expected);
    });

    test('throws on a path without a leading slash', () => {
        expect(() => normalizePath('users')).toThrow(/must start with/);
    });
});

describe('parseSegments', () => {
    test.each([
        ['/', [] as never[]],
        ['/users', [{kind: 'static', name: 'users'}]],
        ['/users/:id', [{kind: 'static', name: 'users'}, {kind: 'param', name: 'id'}]],
        ['/files/*filepath', [{kind: 'static', name: 'files'}, {kind: 'wildcard', name: 'filepath'}]],
    ])('%s → %j', (path, expected) => {
        expect(parseSegments(path)).toEqual(expected);
    });

    test('throws on an empty segment (double slash)', () => {
        expect(() => parseSegments('/users//posts')).toThrow(/Empty path segment/);
    });

    test('throws on an empty param name', () => {
        expect(() => parseSegments('/users/:')).toThrow(/Empty param name/);
    });

    test('throws on an empty wildcard name', () => {
        expect(() => parseSegments('/files/*')).toThrow(/Empty wildcard name/);
    });

    test('throws on a non-identifier param name', () => {
        expect(() => parseSegments('/users/:1abc')).toThrow(/Invalid param name/);
        expect(() => parseSegments('/users/:bad-name')).toThrow(/Invalid param name/);
    });

    test('throws on a wildcard in a non-terminal position', () => {
        expect(() => parseSegments('/files/*filepath/sub')).toThrow(/terminal segment/);
    });

    test('treats ":" or "*" inside a segment as literal static content', () => {
        expect(parseSegments('/users/foo:bar')).toEqual([
            {kind: 'static', name: 'users'},
            {kind: 'static', name: 'foo:bar'},
        ]);
        expect(parseSegments('/users/star*inside')).toEqual([
            {kind: 'static', name: 'users'},
            {kind: 'static', name: 'star*inside'},
        ]);
    });
});

describe('buildTree', () => {
    test('compiles routes and lookup works through the returned tree', () => {
        const tree = buildTree([
            spec('/users'),
            spec('/users/:id'),
            spec('/files/*filepath'),
        ]);

        expect(tree.lookup(HttpMethod.GET, '/users').kind).toBe('found');
        expect(tree.lookup(HttpMethod.GET, '/users/42').kind).toBe('found');
        expect(tree.lookup(HttpMethod.GET, '/files/a/b.txt').kind).toBe('found');
        expect(tree.lookup(HttpMethod.GET, '/nonexistent').kind).toBe('notFound');
    });

    test('throws on a duplicate (method, path) pair', () => {
        expect(() => buildTree([spec('/users'), spec('/users')])).toThrow(/Duplicate route/);
    });

    test('allows the same path with different methods', () => {
        expect(() => buildTree([
            spec('/users', HttpMethod.GET),
            spec('/users', HttpMethod.POST),
        ])).not.toThrow();
    });

    test('throws on conflicting param names at the same level', () => {
        expect(() => buildTree([
            spec('/users/:id/posts'),
            spec('/users/:name/posts'),
        ])).toThrow(/Conflicting param names/);
    });

    test('throws when a param and a wildcard coexist at the same level', () => {
        expect(() => buildTree([
            spec('/users/:id'),
            spec('/users/*rest'),
        ])).toThrow(/cannot coexist/);
    });

    test('propagates normalizePath failures at build time', () => {
        expect(() => buildTree([spec('users')])).toThrow(/must start with/);
    });

    test('returns a tree whose nodes are frozen', () => {
        const tree = buildTree([spec('/users')]);

        expect(Object.isFrozen(tree)).toBe(true);

        const root = tree.root;
        expect(Object.isFrozen(root)).toBe(true);
        expect(Object.isFrozen(root.handlers)).toBe(true);
        expect(Object.isFrozen(root.staticChildren)).toBe(true);

        const usersNode = root.staticChildren.get('users');
        expect(usersNode).toBeDefined();
        expect(Object.isFrozen(usersNode)).toBe(true);
        expect(Object.isFrozen(usersNode?.handlers)).toBe(true);
    });
});

describe('Router.build()', () => {
    test('routes registered via the fluent API land in the built tree', () => {
        const router = new Router();
        router.get('/hello', handler('hello'));
        router.group('/api').post('/users', handler('create-user'));

        const tree = router.build();

        expect(tree.lookup(HttpMethod.GET, '/hello').kind).toBe('found');
        expect(tree.lookup(HttpMethod.POST, '/api/users').kind).toBe('found');
        expect(tree.lookup(HttpMethod.GET, '/api/users').kind).toBe('methodNotAllowed');
    });

    test('the built tree is stable: adding routes after build does not mutate it', () => {
        const router = new Router();
        router.get('/first', handler());
        const tree = router.build();

        router.get('/second', handler());

        expect(tree.lookup(HttpMethod.GET, '/first').kind).toBe('found');
        expect(tree.lookup(HttpMethod.GET, '/second').kind).toBe('notFound');
    });

    test('routes added through nested groups land under the joined prefix', () => {
        const router = new Router();
        const api = router.group('/api');
        const v1 = api.group('/v1');
        v1.get('/ping', handler('ping'));

        const tree = router.build();
        const result = tree.lookup(HttpMethod.GET, '/api/v1/ping');
        expect(result.kind).toBe('found');
    });
});
