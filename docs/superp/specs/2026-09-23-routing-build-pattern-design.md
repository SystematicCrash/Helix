# Design: Route Building Pattern for the HTTP Layer

- **Date:** 2026-09-23
- **Status:** Design approved; implementation pending
- **Branch:** `improve/routing-system`
- **Scope:** Single cohesive redesign of the routing subsystem — six new/replaced files under `src/network/http/routing/`, the dispatcher in `src/network/http/request/RequestRouter.ts` rewired to use the compiled tree, scratch content of `src/network/http/routing/routes.ts` replaced, four new unit test files. No decomposition needed.

## Problem

The current routing layer is half-built and broken in several distinct ways. Each piece is independently wrong, and together they prevent the routing subsystem from working at all.

### What's broken today

- **`src/network/http/routing/RouteHandler.ts`** — empty stub class. No signature documents what a handler receives or returns, so handler authors have no contract.
- **`src/network/http/routing/Route.ts`** — `Route._path`, `Route._method`, `Route._handler` are all nullable. Nothing forces a complete route. `.handler(null)` is silently accepted at compile time.
- **`src/network/http/routing/RadixNode.ts`** — single nullable `handler` per node. Two routes at the same path with different methods would clobber each other. No `insert`/`build` method. `find()` cannot distinguish 404 (no path match) from 405 (path matched, method not allowed) — both return `null`.
- **`src/network/http/routing/routes.ts`** — scratch code: `setRoute('mamad')` (path without leading `/`), `.handler(null)` (silently passes null), `setGroup()` called with no callback despite the typed `(router: Router) => void` parameter, `.setRoute()` called with no arguments.
- **`Group.prefix`** in `Route.ts` — naive string concatenation. `prefix + '/' + path` produces double slashes when the inner path already starts with `/`, and never normalizes trailing slashes on the prefix itself.
- **`src/network/http/request/RequestRouter.ts`** — completely bypasses the radix tree. Uses an inline `if/else`/`switch` chain on `request.url`. The whole routing subsystem is currently dead code.
- **No tests** on any file under `src/network/http/routing/` or on `RequestRouter.ts`.

The net result: the radix tree that was just merged (commit `eec8817 feat: implement RadixNode class`) is not consumed anywhere. Every request falls into a hand-written dispatch chain.

## Decisions made

These are the calls where the codebase gave no clear precedent, recorded so the spec-review pass can sanity-check them in one place.

- **Scope path: B (straight to design, no `decomposing-projects`).** The routing subsystem is a single cohesive piece — one builder API, one tree, one dispatcher. No shared state with other work; nothing to share across plans. *Why:* decomposing adds scaffolding for shared state we don't have.
- **Approach B (lean typed builder) over A (heavy framework) or C (functional defineRoutes).** *Why:* matches the existing small-class style of `HttpRequest`/`HttpResponse`; no middleware concept exists yet; layer swap-ability is a stated goal and a heavyweight API works against that.
- **Per-node method dispatch (`Map<HttpMethod, RouteHandler>`), not method-encoded into the path key.** *Why:* two routes at the same path with different methods is the common case (GET + HEAD, or GET + POST `/users`), and a per-method map gives `405` vs `404` for free; encoding method into the path key would require separate trees per method and lose 405.
- **`Route` builder splits into `Route` (fluent) + `RouteSpec` (frozen value).** *Why:* the only way to make "missing method" / "missing handler" a runtime error rather than a silent nullable field is to defer sealing until `.toSpec()`, and `toSpec()` is only called from `Router.add()`.
- **Validation thrown at `build()` time, not deferred.** *Why:* misroutes should fail on server start (one-shot), not surface as silent 404s in production. Tests assert this with `expect(() => router.get(...).build()).toThrow(...)`.
- **`Allow` header set by `RequestRouter` after `mapErrorToResponse`, not via `HttpError.methodNotAllowed(allowed)`.** *Why:* keeps `HttpError`'s 3-arg surface unchanged and stays symmetric with the existing `Connection: close` pattern at `mapErrorToResponse.ts:22`.
- **`Group.prefix` joining is normalized to exactly one `/`, never two.** *Why:* the current implementation produces `'mamad//path'` for any path that already starts with `/`; the new joiner is centralized and tested at the unit level so it can't regress.
- **No middleware, no per-route hooks, no async error wrapping.** *Why:* YAGNI — none of these have a concrete in-tree caller. Add them when the first concrete need appears.
- **Routing layer gets unit tests for the first time as part of this change.** *Why:* the subsystem currently has zero tests, and a routing library without tests is worse than no routing library — it gives a false sense of correctness.

## Goals

- Replace the half-implemented builder with a **lean, typed, fluent** pattern modeled on the existing tiny-class style of `HttpRequest`/`HttpResponse`.
- Typed handler signature with explicit `(request, body, info, params)` arguments — handler authors cannot compile a malformed handler.
- Method-dispatched radix tree so two handlers at the same path with different methods coexist, with `404` vs `405` distinction returned from lookup.
- **Validation at `build()` time** so misroutes fail loud on server start, not as silent 404s in production:
  - Path normalization (leading `/`, no double slashes, no trailing slash except root).
  - Duplicate `(method, path)` registration throws.
  - Static-segment collision with a `:param` at the same node is resolved in a deterministic order (static wins, like Express).
  - `:param` and `*wildcard` siblings at the same node throws (ambiguous).
  - `:param` and `*name` segment identifiers must match `/^[a-zA-Z_$][a-zA-Z0-9_$]*$/`.
- Compiled tree is **frozen** — `.build()` returns a read-only `RouteTree` reference, the radix nodes are not mutated after build.
- `RequestRouter` becomes a thin dispatcher: split path, call `tree.lookup()`, return `404` / `405` / run handler. Existing `mapErrorToResponse` is reused for the error cases.
- A real test suite covering routing — the subsystem currently has zero.
- Out of scope: middleware chains, async error wrapping inside handlers (handlers can throw and the existing error path catches it), route metadata / OpenAPI export, regex constraints on params, per-route timeouts.

## Architecture

### File layout (each file is one focused concern, matches `src/network/http/response/` style)

```
src/network/http/routing/
├── RouteHandler.ts     # type alias: typed handler signature
├── Route.ts            # single-route fluent builder: .method() required, .handler() required → RouteSpec
├── Group.ts            # prefix-aware sub-router: .get/.post/... + .group()
├── Router.ts           # top-level: .get/.post/... + .group() + .build() → RouteTree
├── RadixNode.ts        # method-dispatched tree node + lookup() returning a discriminated union
└── buildTree.ts        # validates the route list + compiles into the radix tree
```

`src/network/http/request/RequestRouter.ts` becomes the dispatcher.
`src/network/http/routing/routes.ts` becomes the real route definitions file (replaces scratch).

### Handler type (`RouteHandler.ts`)

```ts
export type RouteParams = Readonly<Record<string, string>>;

export type RouteHandler = (
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    params: RouteParams,
) => HttpResponse | Promise<HttpResponse>;
```

Handler authors see all four inputs in the signature. Returning an `HttpResponse` (or a `Promise<HttpResponse>`) is part of the contract; errors thrown from a handler are handled by the existing `mapErrorToResponse` path — no per-route try/catch needed.

`RouteHandler` is currently exported as a default-exported empty class with no other consumers; renaming it from a class to a type alias is a hard breaking change but the only caller-in-scope is `routes.ts` (the scratch file), which is being rewritten in this same change.

### Route builder (`Route.ts`)

```ts
import { HttpMethod } from '../common/constants.js';
import type { RouteHandler, RouteParams } from './RouteHandler.js';

export interface RouteSpec {
    readonly path: string;
    readonly method: HttpMethod;
    readonly handler: RouteHandler;
}

export class Route {
    private readonly _path: string;
    private _method?: HttpMethod;
    private _handler?: RouteHandler;

    constructor(path: string) { this._path = path; }

    public method(method: HttpMethod): this {
        this._method = method;
        return this;
    }

    public handler(handler: RouteHandler): this {
        this._handler = handler;
        return this;
    }

    public toSpec(): RouteSpec {
        if (!this._method) throw new Error(`Route "${this._path}" missing method`);
        if (!this._handler) throw new Error(`Route "${this._path}" missing handler`);
        return { path: this._path, method: this._method, handler: this._handler };
    }
}
```

The split between the fluent builder (`Route`) and the final value (`RouteSpec`) is what makes "missing method" and "missing handler" throw *inside* `toSpec()` — at build time, not silently at lookup time.

### Router and Group (`Router.ts`, `Group.ts`)

```ts
export class Router {
    private readonly routes: RouteSpec[] = [];

    public get    (path: string, h: RouteHandler) { return this.add(HttpMethod.GET,     path, h); }
    public post   (path: string, h: RouteHandler) { return this.add(HttpMethod.POST,    path, h); }
    public put    (path: string, h: RouteHandler) { return this.add(HttpMethod.PUT,     path, h); }
    public patch  (path: string, h: RouteHandler) { return this.add(HttpMethod.PATCH,   path, h); }
    public delete (path: string, h: RouteHandler) { return this.add(HttpMethod.DELETE,  path, h); }
    public head   (path: string, h: RouteHandler) { return this.add(HttpMethod.HEAD,    path, h); }
    public options(path: string, h: RouteHandler) { return this.add(HttpMethod.OPTIONS, path, h); }

    public group(prefix: string): Group { return new Group(this.routes, prefix); }

    public build(): RouteTree { return buildTree(this.routes); }

    private add(method: HttpMethod, path: string, handler: RouteHandler): RouteSpec {
        const spec = new Route(path).method(method).handler(handler).toSpec();
        this.routes.push(spec);
        return spec;
    }
}

export class Group {
    constructor(
        private readonly routes: RouteSpec[],
        private readonly prefix: string,
    ) {}

    // Same get/post/... surface as Router, but each routes to the same backing list
    // with the prefix joined. prefix.join() is the central path normalizer.

    public group(prefix: string): Group { return new Group(this.routes, this.join(prefix)); }
}
```

The group prefix joiner:

```ts
// In Group.ts
private join(path: string): string {
    const left = this.prefix.endsWith('/') ? this.prefix.slice(0, -1) : this.prefix;
    const right = path.startsWith('/') ? path : '/' + path;
    return left + right;
}
```

Examples (validated by tests):

| Group prefix | Path passed | Result   |
|--------------|-------------|-----------|
| `/api`       | `/users`    | `/api/users` |
| `/api`       | `users`     | `/api/users` |
| `/api/`      | `/users`    | `/api/users` |
| `/api/`      | `users`     | `/api/users` |
| `''`         | `/users`    | `/users`  |

`buildTree` additionally normalizes the final path: empty → `/`, strip trailing slashes (root `/` preserved).

### Radix node (`RadixNode.ts`)

The node becomes method-dispatched and has an explicit `insert` + `lookup`:

```ts
export default class RadixNode {
    public readonly handlers: Map<HttpMethod, RouteHandler> = new Map();
    public readonly staticChildren: Map<string, RadixNode> = new Map();
    public paramChild: RadixNode | null = null;
    public paramName: string | null = null;
    public wildcardChild: RadixNode | null = null;
    public wildcardName: string | null = null;

    /** Insert a single static + param/wildcard segment pair into the tree. */
    public insert(segment: string, kind: SegmentKind): RadixNode { /* ... */ }

    /** Look up `segments` for `method`. Returns a discriminated result with any matched params. */
    public lookup(
        method: HttpMethod,
        segments: ReadonlyArray<string>,
        index: number,
    ): {
        kind: 'found';
        handler: RouteHandler;
        params: Record<string, string>;
    } | { kind: 'notFound' } | { kind: 'methodNotAllowed'; allowed: ReadonlyArray<HttpMethod> };

    /* The body of `lookup` accumulates `params` in an internal map during recursion
       and returns a fresh `Record<string, string>` in the `found` result. Callers
       never see partial state from sibling traversal. */
}

export type SegmentKind =
    | { kind: 'static'; name: string }
    | { kind: 'param'; name: string }
    | { kind: 'wildcard'; name: string };

/** External `LookupResult` type matching what the dispatcher works with. */
export type LookupResult =
    | { kind: 'found'; handler: RouteHandler; params: Record<string, string> }
    | { kind: 'notFound' }
    | { kind: 'methodNotAllowed'; allowed: ReadonlyArray<HttpMethod> };
```

`insert` rules:

- Static segment creates/reuses a `staticChildren.get(name)` node. If a param/wildcard child already exists at this node with the same name, **throw** at build time.
- Param segment creates/reuses `paramChild`. If a static child of the same name already exists, the static child wins (matching path matches static first), and the param is skipped for that request — but if *only* a static child with a *different* name exists, the param still claims the new name. Two different param names at the same node is a conflict → throw.
- Wildcard segment **must** be the terminal segment of its route. Only one wildcard allowed per route. `:param` + `*wildcard` siblings at the same node → throw.

`lookup` rules:

- At `index === segments.length`: this node is terminal. If `handlers.has(method)` → `found`. Else if `handlers.size > 0` → `methodNotAllowed` with `handlers.keys()`. Else → `notFound`.
- At `index < segments.length`: try static child, then param child (with `params[name] = decodeURIComponent(segment)`), then wildcard child (with `params[name] = decodeURIComponent(segments.slice(index).join('/'))`). Backtrack across siblings when a branch returns `notFound`.
- A `methodNotAllowed` from a deeper node **does** propagate — it's still a "path matched", so we don't fall through to siblings.

### Tree builder (`buildTree.ts`)

```ts
export default function buildTree(routes: ReadonlyArray<RouteSpec>): RouteTree {
    const root = new RadixNode();

    for (const spec of routes) {
        const normalized = normalizePath(spec.path);
        validateParamName(spec.path);
        const segments = parseSegments(normalized);   // [{kind:'static',name}, {kind:'param',name:'id'}, ...]
        let node = root;
        for (const seg of segments) {
            node = node.insert(seg.name, seg.kind);
        }
        if (node.handlers.has(spec.method)) {
            throw new Error(`Duplicate route: ${spec.method} ${spec.path}`);
        }
        node.handlers.set(spec.method, spec.handler);
    }

    freezeNode(root);
    return Object.freeze({ root });
}

function normalizePath(path: string): string {
    if (!path.startsWith('/')) throw new Error(`Route path must start with "/": ${path}`);
    if (path === '/') return '/';
    return path.replace(/\/+$/, '');   // strip trailing slashes except root
}

function parseSegments(path: string): SegmentKind[] {
    // '/'                  → []
    // '/users'             → [{kind:'static',name:'users'}]
    // '/users/:id'         → [...,'id' as param]
    // '/files/*filepath'   → [...,'filepath' as wildcard terminal]
    // Throws on ':foo:' or '*' with no name, or '**', or ':' inside a static segment.
}
```

`freezeNode` calls `Object.freeze` on the node and recursively on each child — the tree is immutable after build.

After build, `Object.freeze` is applied to the returned `RouteTree` wrapper as well. Any attempt to register a route after `.build()` is a compile-time / runtime error: routes are added via `.get/.post/...` which mutate `Router.routes`. The dispatcher should call `.build()` once at server start and treat the result as immutable.

### `RequestRouter` becomes the dispatcher

```ts
// src/network/http/request/RequestRouter.ts
import type RouteTree from '../routing/Router.js';

export async function handleRequest(
    request: HttpRequest,
    body: HttpBody,
    info: ServerInfo,
    tree: RouteTree,
): Promise<HttpResponse> {
    const segments = splitPath(request.url);
    const result = tree.lookup(request.method as HttpMethod, segments, {});
    switch (result.kind) {
        case 'found':
            return result.handler(request, body, info, result.params);
        case 'methodNotAllowed': {
            const response = mapErrorToResponse(HttpError.methodNotAllowed(), info, request);
            response.setHeader(HttpHeader.Allow, result.allowed.join(', '));
            return response;
        }
        case 'notFound':
        default:
            return mapErrorToResponse(HttpError.notFound(), info, request);
    }
}

function splitPath(url: string): string[] {
    if (url === '/' || url === '') return [];
    return url.split('/').filter((s) => s !== '');
}
```

Two deliberate choices here:
- The `Allow` header is set on the response **after** `mapErrorToResponse` returns, not passed into the `HttpError` factory — keeps `HttpError`'s 3-arg surface (`status`, `message`, `fatal`) unchanged. The `methodNotAllowed()` factory already exists at `src/network/http/common/HttpError.ts:28`.
- `lookup` returns `params` as part of the `{ kind: 'found' }` result rather than mutating an externally-supplied record — keeps the caller's record immutable, which matches the `Readonly<Record<string, string>>` shape of `RouteParams`.

The existing inline `/` and `/files` handling moves to `routes.ts`. `HttpConnection.ts` passes the built tree through to `handleRequest`.

### Real route definitions (`routes.ts`)

```ts
import type Router from './Router.js';
import { renderHtml } from '../../infra/index.js';
import HttpResponse from '../response/HttpResponse.js';
import { serveStaticFile } from '../../fs/index.js';

export default (router: Router): void => {
    router
        .get    ('/',            (_, _b, info) => HttpResponse.html(200, renderHtml('index', { ... })))
        .get    ('/index.html',  (_, _b, info) => HttpResponse.html(200, renderHtml('index', { ... })))
        .get    ('/echo',        (_r, body)    => HttpResponse.from(200, body));

    const files = router.group('/files');
    files.get('/*filepath', (req, _b, _info, params) =>
        serveStaticFile(params.filepath, req.rangeSet));
};
```

The tree is built once at server start by `HttpServer.ts` after `routes(router)` completes; the resulting `RouteTree` is handed to each `HttpConnection` via the existing `this.info`-style injection (the exact plumbing follows the existing `info` pattern in `HttpConnection.ts`).

## Data flow

```
HttpConnection.onRequest(req, body)
        │
        ▼
handleRequest(req, body, info, tree)
        │
        ├── tree.lookup(method, segments, {})   ← radix tree traversal
        │       │
        │       ├── { kind: 'found' } → handler(req, body, info, params)
        │       ├── { kind: 'methodNotAllowed', allowed } → mapErrorToResponse(HttpError.methodNotAllowed(allowed), info, req)
        │       └── { kind: 'notFound' } → mapErrorToResponse(HttpError.notFound(), info, req)
        │
        ▼
HttpResponse  →  ResponseWriter
```

`mapErrorToResponse` is unchanged and still owns the 404/405 → page rendering. The `HttpError.methodNotAllowed(allowed)` factory is added if it does not already exist (verified in `src/network/http/common/HttpError.ts`).

## Error handling

- **Build-time** (loud, fatal): `normalizePath`, `parseSegments`, `insert`, duplicate-route detection all throw `Error` with a clear message. Server startup fails loud.
- **Per-request** (silent 404/405): unmatched path / wrong method → `mapErrorToResponse` produces the existing 404 / new 405 page.
- **Handler errors**: handler authors can `throw`; the existing dispatcher-level error path catches the rejection. No per-route `try`/`catch`.

## Testing

New directory `tests/unit/network/http/routing/` with:

| File | Covers |
|------|--------|
| `RadixNode.test.ts` | static / param / wildcard lookup, backtracking across siblings, 404 vs 405 distinction, param decoding |
| `buildTree.test.ts` | path normalization, duplicate detection, param-name validation, static-vs-param preference, wildcard-as-terminal rule |
| `Router.test.ts` | fluent builder shape, every method shortcut returns a spec, group nesting, `prefix.join()` edge cases, `.build()` freezes the tree |
| `RequestRouter.test.ts` | dispatcher with a built tree: hit, miss, wrong-method returns 405 via `mapErrorToResponse` |

Tests use the existing test conventions (vitest, no new deps, no new helpers). The existing scratch content of `routes.ts` is replaced; no behavioural regression test for it (it was dead code).

## Migration / rollout

1. Land the new files under `src/network/http/routing/`.
2. Rewrite `routes.ts` to use the new pattern.
3. Rewire `RequestRouter.ts` to use the tree; `HttpConnection.ts` carries the tree alongside `info`.
4. Delete the old `Route.ts` `Base`/`Router`/`Group` exporting class triple and the old scratch `.setRoute()` API.
5. Add the four test files.

There is no deprecation window — the old `Route.ts` builder API has no in-tree callers beyond the scratch `routes.ts` and the never-consumed `RadixNode`/`RequestRouter` chain. All in-tree code rewires in the same change.

## Out of scope (YAGNI)

- Middleware chains, `app.use()` — add when first concrete need appears.
- Async error wrapping inside a handler.
- Route metadata / tags / OpenAPI export.
- Regex constraints on params (`:id(\d+)`).
- Per-route timeouts / body-size overrides.
