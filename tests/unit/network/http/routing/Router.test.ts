import {describe, test, expect} from 'vitest';
import Router from '../../../../../src/network/http/routing/Router.js';
import {Group} from '../../../../../src/network/http/routing/Group.js';
import {HttpMethod} from '../../../../../src/network/http/common/constants.js';
import HttpResponse from '../../../../../src/network/http/response/HttpResponse.js';
import type {RouteHandler} from '../../../../../src/network/http/routing/RouteHandler.js';

const handler = (label = 'test'): RouteHandler => () => HttpResponse.html(200, label);

describe('Router method shortcuts', () => {
    test.each([
        ['get', HttpMethod.GET],
        ['post', HttpMethod.POST],
        ['put', HttpMethod.PUT],
        ['patch', HttpMethod.PATCH],
        ['delete', HttpMethod.DELETE],
        ['head', HttpMethod.HEAD],
        ['options', HttpMethod.OPTIONS],
    ] as const)('router.%s registers a route with the matching HttpMethod', (shortcut, method) => {
        const router = new Router();
        router[shortcut]('/target', handler(shortcut));

        expect(router.routes).toHaveLength(1);
        const spec = router.routes[0];
        expect(spec?.path).toBe('/target');
        expect(spec?.method).toBe(method);
        expect(typeof spec?.handler).toBe('function');
    });

    test('shortcuts are chainable (each call returns the router)', () => {
        const router = new Router();
        const ret = router.get('/a', handler()).post('/b', handler());
        expect(ret).toBe(router);
        expect(router.routes).toHaveLength(2);
    });

    test('paths on the top-level router are taken verbatim (no prefix joining)', () => {
        const router = new Router();
        router.get('/users/:id', handler());

        expect(router.routes[0]?.path).toBe('/users/:id');
    });
});

describe('Group prefix joining', () => {
    const join = (prefix: string, path: string): string => {
        const router = new Router();
        const group = router.group(prefix);
        group.get(path, handler());
        return router.routes[0]?.path;
    };

    test.each([
        ['/api', '/users', '/api/users'],
        ['/api', 'users', '/api/users'],
        ['/api/', '/users', '/api/users'],
        ['/api/', 'users', '/api/users'],
        ['', '/users', '/users'],
    ])('group(%j).get(%j) → %s', (prefix, path, expected) => {
        expect(join(prefix, path)).toBe(expected);
    });

    test('a nested group composes its parent prefix', () => {
        const router = new Router();
        const api = router.group('/api');
        const v1 = api.group('/v1');
        v1.get('/ping', handler());

        expect(router.routes[0]?.path).toBe('/api/v1/ping');
    });

    test('group returns a Group instance sharing the same route list as the router', () => {
        const router = new Router();
        const group = router.group('/api');

        expect(group).toBeInstanceOf(Group);
        expect(group.routes).toBe(router.routes);
    });
});

describe('RouteSpec sealing', () => {
    test('the spec handler is the same reference the user supplied', () => {
        const router = new Router();
        const myHandler: RouteHandler = () => HttpResponse.empty(200);
        router.get('/x', myHandler);

        expect(router.routes[0]?.handler).toBe(myHandler);
    });
});
