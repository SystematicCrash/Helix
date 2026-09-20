# Design: Concrete `HttpResponse` Class

- **Date:** 2026-09-20
- **Status:** Design approved; implementation pending
- **Branch:** `improve/error-handling`
- **Scope:** Single cohesive refactor — one new class file, four import sites rewired, dead `renderHtml` import removed in `mapErrorToResponse.ts`, `RequestRouter` `/` branch rewired to use `indexPage` from the pages module. No decomposition needed.

## Problem

`HttpResponse` is a plain interface in `src/network/http/common/types.ts`. Every consumer — `mapErrorToResponse`, `RequestRouter`, `ResponseWriter`, `encodeHeaders` — builds it ad hoc with raw object literals and re-implements the same boilerplate at every call site:

```typescript
// today's pattern at every call site
{
    code: ...,
    body: new MemoryBody(html),
    version: HttpVersion.HTTP_1_1,
    headers: new Map([['Content-Type', 'text/html; charset=utf-8']]),
}
```

The codebase has already converted other major HTTP domain types into concrete classes with useful methods and required properties — `HttpRequest` is the model:

- Public fields, mutable `headers: Map`, mutable parsed values.
- Validation in the constructor (parses + validates the request line).
- `static from(...)` factory mirror of the constructor.
- Getters that derive typed views (`rangeSet`, `contentLength`, `transferEncoding`, `isBodyAllowed`).
- One method that performs the next async step (`getBody`).

`HttpResponse` should follow the same pattern. The interface can be deleted once the class lands.

## Goals

- Replace the `HttpResponse` interface with a concrete class at `src/network/http/response/HttpResponse.ts`, modeled on `HttpRequest`.
- Required constructor params: `code`, `body`. Defaults for `version` (HTTP/1.1) and `headers` (empty Map).
- Useful factories: `.html(...)`, `.json(...)`, `.empty(...)`, `.redirect(...)` — eliminate ad-hoc `new MemoryBody(...)` + `headers.set('Content-Type', ...)` at every call site.
- Useful getters: `statusText` (from `HTTP_STATUS` map), `contentLength` (null when unknown).
- Constructor validates `code ∈ [100, 599]` and non-empty `version`.
- Zero wire-format change — `ResponseWriter` and `encodeHeaders` keep producing identical bytes.
- Reuse the existing `HTTP_STATUS` constant from `src/network/http/common/constants.ts:112`.

## Non-goals

- No HTTP/2 or HTTP/3 response shapes (different framing).
- No streaming-response-with-trailers support.
- No builder-pattern immutable variant (`withHeader(...)`) — easy to add later.
- No template changes; pages module stays as-is.

## Architecture

```
RequestRouter ──┐                                  ┌──> HttpResponse.html(code, html)
                ├──> HttpResponse (new) ───────────┤
mapErrorToResponse ─┘   factories, mutators,        ├──> HttpResponse.redirect(code, loc)
                        statusText/contentLength     │
                                                    ├──> HttpResponse.empty(code)
                                                    └──> new HttpResponse(code, body, version)
                                                              │
                                                              ▼
                                                    ResponseWriter.write(conn, response) ──> encodeHeaders + body
```

The class is a leaf in the response layer. Sibling to `ResponseWriter.ts`, `pages.ts`, `mapErrorToResponse.ts`. The `HttpResponse` interface is removed from `common/types.ts`; the rest of that file (`ChunkExtension`, `StaticFileStream`, `BufferGenerator`) stays.

## Public API

```typescript
import HttpResponse from "../response/HttpResponse.js";

export default class HttpResponse {
    headers: Map<string, string> = new Map();

    constructor(
        public code: number,
        public body: HttpBody,
        public version: string = HttpVersion.HTTP_1_1,
    );

    // ---- factories ---------------------------------------------------
    static from(code: number, body: HttpBody, version?: string): HttpResponse;
    static html(code: number, html: string | Buffer, version?: string): HttpResponse;          // Content-Type: text/html; charset=utf-8
    static json(code: number, value: unknown, version?: string): HttpResponse;                  // JSON.stringify(value); application/json
    static empty(code: number, version?: string): HttpResponse;                                 // 204 / 304 etc.
    static redirect(code: 301 | 302 | 307 | 308, location: string, version?: string): HttpResponse;

    // ---- mutators -----------------------------------------------------
    setHeader(name: string, value: string): this;
    setCode(code: number): this;
    setVersion(version: string): this;
    setBody(body: HttpBody): this;

    // ---- lookups ------------------------------------------------------
    getHeader(name: string): string | undefined;
    hasHeader(name: string): boolean;
    get statusText(): string;           // HTTP_STATUS[this.code]; falls back to 'Unknown'
    get contentLength(): number | null; // body.length when known, null when -1

    // ---- validation ---------------------------------------------------
    private validate(): void;            // code ∈ [100, 599]; version non-empty
}
```

### Required vs default properties

| Property   | Required? | Default                  |
|------------|-----------|--------------------------|
| `code`     | ✅ yes    | —                        |
| `body`     | ✅ yes    | —                        |
| `version`  | no        | `HttpVersion.HTTP_1_1`   |
| `headers`  | no        | `new Map()`              |

Mirrors `HttpRequest`: parsed values are required, headers default to empty.

### Factories — what each does

- `HttpResponse.from(code, body, version?)` — pass-through to `new HttpResponse(...)`. Mirrors `HttpRequest.from`.
- `HttpResponse.html(code, html, version?)` — wraps `html` in `MemoryBody`, sets `Content-Type: text/html; charset=utf-8`.
- `HttpResponse.json(code, value, version?)` — `JSON.stringify(value)`, sets `Content-Type: application/json`.
- `HttpResponse.empty(code, version?)` — uses `EmptyBody` (length 0).
- `HttpResponse.redirect(code, location, version?)` — sets `Location: location`; body is a tiny `MemoryBody` with the redirect reason for non-HEAD clients (e.g. `"Redirecting to <location>"`).

## File changes

1. **New** `src/network/http/response/HttpResponse.ts` — the class above.
2. **Edit** `src/network/http/common/types.ts` — remove `HttpResponse` interface; keep `ChunkExtension`, `StaticFileStream`, `BufferGenerator`.
3. **Edit** `src/network/http/response/mapErrorToResponse.ts` — `import HttpResponse from "./HttpResponse.js"`; return `new HttpResponse(error.status, MemoryBody.from(payload), HttpVersion.HTTP_1_1)`; remove the now-dead `renderHtml` import.
4. **Edit** `src/network/http/request/RequestRouter.ts` — `import HttpResponse from "../response/HttpResponse.js"`; index branch becomes `payload = new MemoryBody(indexPage(info))` and the route returns `HttpResponse.html(200, indexPage(info), request.version)`; other branches use the appropriate factory or `new HttpResponse(...)`.
5. **Edit** `src/network/http/response/ResponseWriter.ts` — `import HttpResponse from "./HttpResponse.js"`; use `response.contentLength` getter where it's clearer than `response.body.length`; signature otherwise unchanged.
6. **Edit** `src/network/http/response/encoder/encodeHeaders.ts` — `import HttpResponse from "../HttpResponse.js"`; signature otherwise unchanged (it reads `response.code`, `response.version`, `response.headers`).
7. **New** `tests/unit/network/http/HttpResponse.test.ts` — see Testing.
8. **Edit** `tests/unit/network/http/response.test.ts` — only if existing assertions reference the old interface (verify by running the suite before any edit).

## Data flow (unchanged)

- `GET /` → `handleRequest` → `HttpResponse.html(200, indexPage(info), request.version)` → 200 with HTML body.
- Unknown URL → `HttpError.notFound()` → `HttpServer.handleError` normalizes via `mapToHttpError` → `mapErrorToResponse` → `new HttpResponse(404, MemoryBody.from(notFoundPage(request, info)), HttpVersion.HTTP_1_1)` → 404 with HTML body.
- 5xx → `mapErrorToResponse` → `new HttpResponse(error.status, MemoryBody.from(internalErrorPage(...)), HttpVersion.HTTP_1_1)` → 5xx with HTML body.

## Error handling

- Constructor throws on `code < 100 || code > 599` or empty `version`. Error name: `RangeError` (built-in) is fine; do not introduce a custom error class for two checks.
- `statusText` falls back to `'Unknown'` when `HTTP_STATUS` lacks an entry — never throws.
- `contentLength` returns `null` when `body.length === -1` (chunked / EOF). Never throws.

## Testing

New `tests/unit/network/http/HttpResponse.test.ts`:

- Constructor: defaults (`HTTP_1_1`, empty headers); rejects out-of-range code; rejects empty version.
- Factories:
  - `.html(code, "<h1/>")` sets Content-Type and produces a `MemoryBody` with the bytes.
  - `.json(code, {a:1})` serializes and sets Content-Type.
  - `.empty(code)` returns an `EmptyBody`.
  - `.redirect(302, "/x")` sets `Location` header and a non-empty body.
- Mutators return `this` (chainable).
- `statusText` for `200` is `'OK'`, for `404` is `'Not Found'`, for an unmapped code is `'Unknown'`.
- `contentLength` returns the number when `body.length !== -1`, and `null` for chunked/EOF bodies.
- `getHeader` / `hasHeader` round-trip with `setHeader`.

Existing tests stay green:
- `tests/unit/network/http/response.test.ts` — pin the wire format.
- `tests/unit/network/http/request.test.ts` — unaffected.

Run the full suite (`npm test`) before and after.

## Decisions Made

- **Class at `src/network/http/response/HttpResponse.ts`** — sits next to `ResponseWriter`, `pages`, `mapErrorToResponse`, the helpers it composes with.
- **Required: `code` + `body`; defaults for `version` and `headers`** — mirrors `HttpRequest` where parsed values are required and `headers` defaults to an empty Map.
- **Factories for HTML / JSON / empty / redirect** — the highest-leverage call sites for this codebase (every route + every error branch); eliminates the `new MemoryBody(...)` + `headers.set('Content-Type', ...)` boilerplate that's currently duplicated at every consumer.
- **`statusText` and `contentLength` are derived getters, not stored** — read from `HTTP_STATUS` and `body.length` respectively (single source of truth, no drift).
- **Wire format unchanged** — `ResponseWriter` and `encodeHeaders` produce identical bytes; existing tests must pass unchanged.
- **Constructor validates `code ∈ [100, 599]` and non-empty `version`** — mirrors `HttpRequest.parse` validating the request line on construction.
- **Two scope-adjacent cleanups included** — dead `renderHtml` import in `mapErrorToResponse.ts` (1 line removed) and `RequestRouter` `/` branch rewired to use `indexPage(info)` (closes the loop the pages module was created for).
- **`HttpResponse.from(...)` mirrors `HttpRequest.from(...)`** — same factory pattern the project uses elsewhere.
- **No `manage_adr` write** — destructive-replacement risk to the existing `project-picture` content there; the decision is captured in this committed spec instead.

## Future work (out of scope)

- `withHeader(...)` immutable variant when the codebase adopts immutable ergonomics.
- A "default error HTML" that doesn't depend on Eta templates, as a fallback for `RenderError`.
- HTTP/2 response shape (different framing — held off until the HTTP/2 layer lands).
