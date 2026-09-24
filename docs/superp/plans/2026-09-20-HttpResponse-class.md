# HttpResponse Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this plan defines tasks, dependencies, and acceptance criteria only. Use the superp:subagent-driven-development sequential dispatch loop (recommended — fresh subagent per task, dispatched one at a time in topo order, with review between tasks) or execute tasks inline in topo order to actually write code, tests, and commits. `Parallel-safe with` and true concurrent execution are only exploited by superp:executing-plans (separate session, isolated worktrees); subagent-driven-development always dispatches one implementer at a time. Steps use checkbox (`- [ ]`) syntax for tracking. Task ordering MUST respect each task's `Depends on` field — do not execute or dispatch a task before all of its dependencies are checked off. The plan is not finished until every item in the Definition of Done section at the end is satisfied — task checkboxes alone do not mean the project is done.

**Goal:** Replace the `HttpResponse` interface in `src/network/http/common/types.ts` with a production-ready concrete class modeled on `HttpRequest` (required `code`+`body`, validated constructor, derived `statusText`/`contentLength` getters, and `html`/`json`/`empty`/`redirect` factories); rewire every consumer to the class; delete the dead `renderHtml` import in `mapErrorToResponse.ts`; rewire `RequestRouter`'s `/` branch to use `indexPage` from the pages module.

**Architecture:** The class lives at `src/network/http/response/HttpResponse.ts` (sibling to `ResponseWriter`, `pages.ts`, `mapErrorToResponse.ts`). `HttpResponse` is removed from `common/types.ts`; the rest of that file (`ChunkExtension`, `StaticFileStream`, `BufferGenerator`) is untouched. The 4 consumer files (`mapErrorToResponse`, `ResponseWriter`, `encodeHeaders`, `RequestRouter`) update their import paths and use the new constructors/factories. Wire format is preserved byte-for-byte — `ResponseWriter.write` and `encodeHeaders` continue to read `response.version`/`response.code`/`response.headers` and `response.body.length` directly, so `response.test.ts` keeps passing without scenario changes.

**Tech Stack:** TypeScript (ESM, `tsx` for dev runs), `vitest` for unit tests.

## Global Constraints

- ESM only (`"type": "module"`). All source imports use `.js` extensions even though source is `.ts`.
- Helix architecture: `infra` is a leaf; `network/http` imports from `infra`. Pages module (`src/network/http/response/pages.ts`) is the home for built-in page rendering. `HttpResponse` is a response-layer construct; it stays there.
- Mirror the `HttpRequest` shape: public mutable fields, `headers: Map<string, string>` with default empty Map, `static from(...)` factory, getters that derive typed views, constructor validates inputs.
- Required constructor params: `code` (number in `[100, 599]`) and `body` (`HttpBody`). `version` defaults to `HttpVersion.HTTP_1_1`. `headers` defaults to `new Map()`.
- Factories: `.html(code, html)`, `.json(code, value)`, `.empty(code)`, `.redirect(code, location)`, `.from(code, body, version?)`.
- Getters: `statusText` (from `HTTP_STATUS[code]`, falls back to `'Unknown'`), `contentLength` (returns `body.length` when `!== -1`, else `null`).
- Mutators: `setHeader(name, value)`, `setCode(code)`, `setVersion(version)`, `setBody(body)` — each returns `this`.
- Constructor validation throws `RangeError` for out-of-range code (out of `[100, 599]`) or empty `version`. No custom error class for two checks.
- Wire format unchanged: `ResponseWriter.write` and `encodeHeaders` produce identical bytes after the migration.
- `mapErrorToResponse` canonical argument order: `(error: HttpError, request: HttpRequest, info: ServerInfo)`. This matches `HttpServer.handleError`'s call site and `tests/unit/network/http/response.test.ts`'s existing call sites (both pass `request` before `info`); the pages-module commit changed the function's signature without updating callers, leaving the codebase in a non-compiling test state that Task 2 fixes as part of this work.
- `ServerInfo` field is `iFace` (capital F) — already correct in `pages.ts`; preserved here.

## Task Dependency Graph

```
Task 1 → Task 2
Task 1 → Task 3
Task 2, Task 3 → Task 4
Task 4 → Task 5
```

---

### Task 1: Build the `HttpResponse` class

**Priority:** Critical — the entire refactor depends on this class existing at `src/network/http/response/HttpResponse.ts`.

**Depends on:** none.

**Parallel-safe with:** none — must run first.

**Files:**
- Create: `src/network/http/response/HttpResponse.ts`
- Test: `tests/unit/network/http/HttpResponse.test.ts`

**Shared files (conflict risk):** none — safe for parallel worktree execution.

**Interfaces:**
- Consumes:
  - `src.network.http.body.HttpBody.HttpBody` (abstract base; `length: number = -1`, `read(): Promise<Buffer | null>`).
  - `src.network.http.body.EmptyBody.EmptyBody` (concrete; `length = 0`).
  - `src.network.http.body.MemoryBody.MemoryBody` (concrete; constructor takes `Buffer`, `length = buffer.length`, `static from(buffer)`).
  - `src.network.http.common.constants.HttpVersion.HTTP_1_1` (string constant).
  - `src.network.http.common.constants.HTTP_STATUS` (Record<number, string>).
- Produces:
  - `src.network.http.response.HttpResponse.HttpResponse` (default-exported class) — public fields `code: number`, `body: HttpBody`, `version: string`, `headers: Map<string, string>`; constructors and factories described below.

**Validation Method:** `tdd` — write the failing test suite first (Task 1 Step 1), confirm it fails (module doesn't exist), then implement the class (Task 1 Step 2) to pass.

**Acceptance Criteria:**

- Given `new HttpResponse(200, new EmptyBody())`, the instance has `code === 200`, `body` is the passed `EmptyBody`, `version === 'HTTP/1.1'`, `headers` is a fresh empty `Map`.
- Given `new HttpResponse(204, body, 'HTTP/1.0')`, `version === 'HTTP/1.0'`.
- Given `new HttpResponse(99, body)` or `new HttpResponse(600, body)`, the constructor throws (out of `[100, 599]`).
- Given `new HttpResponse(200, body, '')`, the constructor throws (empty `version`).
- Given `HttpResponse.from(201, body)`, returns an instance with `code === 201`.
- Given `HttpResponse.html(200, '<h1/>')`, the instance has `body` whose `length` equals `Buffer.byteLength('<h1/>')` and a `Content-Type: text/html; charset=utf-8` header set.
- Given `HttpResponse.html(200, Buffer.from('<h1/>'))`, the instance's body bytes equal `Buffer.from('<h1/>')` (Buffer input supported).
- Given `HttpResponse.json(200, { a: 1 })`, the instance has `Content-Type: application/json` header set and a body containing the bytes `{"a":1}` (modulo JSON.stringify spacing — assert via `Buffer.from(JSON.stringify({a:1})).equals(body.read())` shape, or test the byte content directly).
- Given `HttpResponse.empty(204)`, the instance has `body` instanceof `EmptyBody` and `contentLength === 0`.
- Given `HttpResponse.redirect(302, '/x')`, the instance has a `Location: /x` header set and a non-empty body.
- Given `setHeader('X', 'Y')` on an instance, it returns `this` (chainable), and subsequent `getHeader('X')` returns `'Y'`; `hasHeader('X')` is `true`.
- Given `setCode(404)`, it returns `this` and `code === 404`.
- Given `setVersion('HTTP/1.0')`, it returns `this` and `version === 'HTTP/1.0'`.
- Given `setBody(newBody)`, it returns `this` and `body === newBody`.
- Given an instance with `code === 200`, `statusText === 'OK'`. For `code === 404`, `statusText === 'Not Found'`. For an unmapped code (e.g. `999`), `statusText === 'Unknown'`.
- Given an instance with a `MemoryBody` of `N` bytes, `contentLength === N`. Given an instance with a body whose `length === -1` (e.g. `StreamBody` with no `length`), `contentLength === null`.
- All existing tests (`npm test`) still pass after the class is added (it is a brand-new file; existing tests don't import from it yet).

- [ ] **Step 1:** Create `tests/unit/network/http/HttpResponse.test.ts` with vitest `describe`/`test`/`expect` blocks matching the existing test-file style (see `tests/unit/network/http/response.test.ts`). Cover every scenario in the Acceptance Criteria above. Run `npm test` and confirm the new tests fail because `HttpResponse.ts` doesn't exist.
- [ ] **Step 2:** Create `src/network/http/response/HttpResponse.ts` with the class per the spec. Run `npm test` and confirm the new tests pass and no existing tests regress.
- [ ] **Step 3: Commit** (executor writes the commit message and runs `git commit`).

---

### Task 2: Wire `mapErrorToResponse`, `ResponseWriter`, `encodeHeaders` to the new class

**Priority:** Critical — without this, the rest of the codebase still uses the (soon-to-be-deleted) interface.

**Depends on:** Task 1.

**Parallel-safe with:** Task 3 (disjoint file sets: Task 2 touches `src/network/http/response/mapErrorToResponse.ts`, `src/network/http/response/ResponseWriter.ts`, `src/network/http/response/encoder/encodeHeaders.ts`; Task 3 touches `src/network/http/request/handleRequest.ts`). Each task reads the other's files for compile-time guarantees only; no overlap.

**Files:**
- Modify: `src/network/http/response/mapErrorToResponse.ts` — anchors: function `mapErrorToResponse` (signature + return body) and the `renderHtml` import line.
- Modify: `src/network/http/response/ResponseWriter.ts` — anchor: the `import {HttpResponse}` line at the top of the file.
- Modify: `src/network/http/response/encoder/encodeHeaders.ts` — anchor: the `import {HttpResponse}` line at the top of the file.

**Shared files (conflict risk):** none — these three files are not touched by any other task.

**Interfaces:**
- Consumes: `src.network.http.response.HttpResponse.HttpResponse` (Task 1).
- Produces: a `mapErrorToResponse` whose public signature is `(error: HttpError, request: HttpRequest, info: ServerInfo): HttpResponse` (canonicalized); `ResponseWriter.write` and `encodeHeaders` whose public signatures are unchanged.

**Validation Method:** `manual-verification` — running `npm test` is the gate; the existing `tests/unit/network/http/response.test.ts` already pins the wire behavior. After Task 2 lands, those tests must pass without scenario changes.

**Acceptance Criteria:**

- `mapErrorToResponse(new HttpError(404, 'Not found'), PLACEHOLDER_REQUEST, INFO)` (canonical `(error, request, info)` order) returns an `HttpResponse` instance (default-exported from `src/network/http/response/HttpResponse.ts`) with `code === 404`, `body` containing the not-found HTML, `version === 'HTTP/1.1'`, and a fresh empty `headers` Map.
- `mapErrorToResponse(new HttpError(500, 'Server down'), PLACEHOLDER_REQUEST, INFO)` returns an instance with `code === 500` and the internal-error HTML body.
- `mapErrorToResponse(new HttpError(422, 'Cannot parse'), PLACEHOLDER_REQUEST, INFO)` returns an instance with `code === 422` and a `MemoryBody` whose byte length equals `Buffer.byteLength('Cannot parse')`.
- The line `import {renderHtml} from "../../../infra/index.js"` is removed from `src/network/http/response/mapErrorToResponse.ts`.
- `src/network/http/response/ResponseWriter.ts` imports `HttpResponse` from `"./HttpResponse.js"` (default-import, not `{}`). `ResponseWriter.write` and `encodeHeaders` continue to read `response.version`, `response.code`, `response.headers`, `response.body.length` directly — no method callsite changes needed; behavior is byte-identical.
- `src/network/http/response/encoder/encodeHeaders.ts` imports `HttpResponse` from `"../HttpResponse.js"` (default-import). `encodeHeaders` body is unchanged; behavior is byte-identical.
- `npm test` exits 0; no test scenario was modified.

- [ ] **Step 1:** Edit `src/network/http/response/mapErrorToResponse.ts`: replace `import {HttpResponse} from "../common/types.js"` with `import HttpResponse from "./HttpResponse.js"`; canonicalize the function signature to `mapErrorToResponse(error: HttpError, request: HttpRequest, info: ServerInfo)`; replace the returned object literal with `return new HttpResponse(error.status, MemoryBody.from(payload), HttpVersion.HTTP_1_1)`; remove the now-dead `import {renderHtml} from "../../../infra/index.js"` line. Confirm no other lines in the file reference `renderHtml`.
- [ ] **Step 2:** Edit `src/network/http/response/ResponseWriter.ts`: replace `import {HttpResponse} from "../common/types.js"` with `import HttpResponse from "./HttpResponse.js"`. No other change to this file.
- [ ] **Step 3:** Edit `src/network/http/response/encoder/encodeHeaders.ts`: replace `import {HttpResponse} from "../../common/types.js"` with `import HttpResponse from "../HttpResponse.js"`. No other change to this file.
- [ ] **Step 4:** Run `npm test`. Confirm exit 0.
- [ ] **Step 5: Commit** (executor writes the commit message and runs `git commit`).

---

### Task 3: Rewire `RequestRouter` to the new class and the pages module

**Priority:** High — request layer still constructs responses via the old literal pattern; also completes the pages-module integration.

**Depends on:** Task 1.

**Parallel-safe with:** Task 2 (disjoint file set: only `src/network/http/request/handleRequest.ts` is touched).

**Files:**
- Modify: `src/network/http/request/handleRequest.ts` — anchors: the `import {HttpResponse}` line, the `renderHtml` import line, the `/` branch of `handleRequest` (calls `renderHtml('index', ...)`), and every branch's return literal.

**Shared files (conflict risk):** none.

**Interfaces:**
- Consumes: `src.network.http.response.HttpResponse.HttpResponse` (Task 1); `src.network.http.response.pages.indexPage` (already on disk, committed at `pages.ts`).
- Produces: a `handleRequest(request, body, info): Promise<HttpResponse>` whose every return is an `HttpResponse` instance constructed via factory or `new`.

**Validation Method:** `manual-verification` — `npm test` is the gate (existing tests pin behavior).

**Acceptance Criteria:**

- `handleRequest` for `request.url === '/'` returns an `HttpResponse` instance constructed via `HttpResponse.html(200, indexPage(info), request.version)`; the body contains the index HTML; `code === 200`; `Content-Type: text/html; charset=utf-8` header set.
- `handleRequest` for `request.url === '/index.html'` returns the same shape as `/` (existing behavior).
- `handleRequest` for `request.url === '/echo'` returns an `HttpResponse` with `code === 200` and the request body.
- `handleRequest` for `request.url === '/sheep'` returns an `HttpResponse` with `code === 200` and the streaming body.
- `handleRequest` for `request.url === '/files/...'` returns an `HttpResponse` with `code === file.status`, `Accept-Range: bytes` header set, optional `content-range` header, and the file body. The 404 from `rethrowFsNotFound` still bubbles through `mapErrorToResponse`.
- The line `import {renderHtml} from "../../../infra/index.js"` is removed from `src/network/http/request/handleRequest.ts` (it is unused after the `/` branch is rewired).
- `src/network/http/request/handleRequest.ts` imports `HttpResponse` from `"../response/HttpResponse.js"` (default-import) and `indexPage` from `"../response/pages.js"`.
- `npm test` exits 0; no test scenario was modified.

- [ ] **Step 1:** Edit `src/network/http/request/handleRequest.ts`: replace `import {HttpResponse} from "../common/types.js"` with `import HttpResponse from "../response/HttpResponse.js"`; replace `import {renderHtml} from "../../../infra/index.js"` with `import {indexPage} from "../response/pages.js"` (drop `renderHtml` entirely). In `handleRequest`, replace the `/` branch's `renderHtml('index', {...})` + `new MemoryBody(html)` + returned literal with `return HttpResponse.html(200, indexPage(info), request.version)`. Replace the `/echo`, `/sheep`, and `/files/...` branches' returned literals with `new HttpResponse(statusCode, payload, request.version)` calls; set `Accept-Range: bytes` and `content-range` headers via `response.setHeader(...)` if needed (or assign to the response's `headers` Map directly). Confirm no other lines reference `renderHtml` in the file.
- [ ] **Step 2:** Run `npm test`. Confirm exit 0.
- [ ] **Step 3: Commit** (executor writes the commit message and runs `git commit`).

---

### Task 4: Delete the `HttpResponse` interface and fix test-file imports

**Priority:** High — leaves the codebase clean of the old interface and corrects the pre-existing broken test imports.

**Depends on:** Task 2, Task 3 (Tasks 2 and 3 must have migrated every source-code import from `common/types.js` to the new class path before this task deletes the interface).

**Parallel-safe with:** none — must run after Tasks 2 and 3.

**Files:**
- Modify: `src/network/http/common/types.ts` — anchor: the `HttpResponse` interface declaration block.
- Modify: `tests/unit/network/http/response.test.ts` — anchor: the `import { HttpRequest, HttpResponse } from '../../../../src/network/http/common/types.js'` line.

**Shared files (conflict risk):** none — no other task touches either of these files.

**Interfaces:**
- Consumes: `src.network.http.response.HttpResponse.HttpResponse` (Task 1) for the test's `import type` (or default-import — see Step 3).
- Produces: a `common/types.ts` that no longer mentions `HttpResponse`; a `response.test.ts` that compiles.

**Validation Method:** `manual-verification` — `npm test` exit 0; the executor also performs a `grep` to confirm no remaining references to the deleted symbol.

**Acceptance Criteria:**

- `src/network/http/common/types.ts` contains `ChunkExtension`, `StaticFileStream`, `BufferGenerator` but no `HttpResponse` declaration.
- `tests/unit/network/http/response.test.ts` imports `HttpRequest` from the correct class module (`../../../../src/network/http/request/HttpRequest.js`, default-import) and `HttpResponse` from the new class module (`../../../../src/network/http/response/HttpResponse.js`, either default-import or `import type` — executor's choice based on whether the symbol is used at runtime in the test body or only as a type).
- `grep -rn "HttpResponse" src/network/http/common/` returns nothing (the interface is gone).
- `grep -rn "from.*common/types.js" src/ tests/` shows no remaining import of `HttpResponse` from `common/types.js`. (Other types from that module — `ChunkExtension`, `StaticFileStream`, `BufferGenerator` — may still be imported and must remain working.)
- `npm test` exits 0.

- [ ] **Step 1:** Run `grep -rn "HttpResponse" src/ tests/` to confirm no remaining reference to the interface (after Tasks 2 and 3 have migrated all consumers, only `common/types.ts` and `response.test.ts` should still reference it). If any unexpected reference is found, stop and resolve before proceeding.
- [ ] **Step 2:** Delete the `HttpResponse` interface declaration block from `src/network/http/common/types.ts`. Confirm the rest of the file (`ChunkExtension`, `StaticFileStream`, `BufferGenerator`) is intact.
- [ ] **Step 3:** Edit `tests/unit/network/http/response.test.ts`: replace the broken `import { HttpRequest, HttpResponse } from '../../../../src/network/http/common/types.js'` line with two correct imports — `HttpRequest` from `request/HttpRequest.js` (default-import) and `HttpResponse` from `response/HttpResponse.js` (default-import or `import type` — use `import type` if the symbol is used only in type positions like `PLACEHOLDER_REQUEST: HttpRequest` style). Remove the now-unused `HttpVersion` import if it becomes unused (or leave it if still referenced).
- [ ] **Step 4:** Run `npm test`. Confirm exit 0.
- [ ] **Step 5: Commit** (executor writes the commit message and runs `git commit`).

---

### Task 5: Final verification

**Priority:** Critical — proves the integrated system works end-to-end.

**Depends on:** Task 4.

**Parallel-safe with:** none — solo verification pass.

**Files:**
- Read-only audit; no file modifications expected.

**Shared files (conflict risk):** none.

**Interfaces:**
- Consumes: all Tasks 1–4 outputs.
- Produces: project-level Definition of Done satisfaction.

**Validation Method:** `manual-verification` — runs the test suite, performs grep audits, runs the server and curls representative URLs.

**Acceptance Criteria:**

- `npm test` exits 0 with zero failures across the full Vitest suite (unit + integration).
- `grep -rn "TODO\|TBD\|XXX\|FIXME" src/network/http/response/HttpResponse.ts src/network/http/response/mapErrorToResponse.ts src/network/http/response/pages.ts src/network/http/request/handleRequest.ts src/network/http/common/types.ts` returns zero lines.
- `grep -rn "HttpResponse" src/network/http/common/` returns zero lines (interface is fully removed).
- Manual: with the server started via `npx tsx index.ts` (or the project's documented launch command), `curl -i http://localhost:<port>/` returns HTTP 200 with a body containing the index HTML and a `Content-Type: text/html; charset=utf-8` header.
- Manual: `curl -i http://localhost:<port>/missing` returns HTTP 404 with the not-found HTML body.
- Manual: triggering a 500 (the simplest path: temporarily send a request that surfaces a generic `Error` through `HttpServer.handleError`'s `mapToHttpError` — note: most paths are normalized to `HttpError`; one robust option is to break the connection mid-write so a socket write fails; or run a pre-existing probe if one exercises a 5xx path) returns HTTP 500 with the internal-error HTML body.

- [ ] **Step 1:** Run `npm test`. Confirm exit 0 with zero failures.
- [ ] **Step 2:** Run the placeholder grep above. Confirm zero hits.
- [ ] **Step 3:** Run the leftover-`HttpResponse`-in-`common/types/` grep. Confirm zero hits.
- [ ] **Step 4:** Start the server (per the project's `package.json` `start` script or `npx tsx index.ts`) and execute the three manual `curl` checks above. Document the observed status codes and headers in the commit message (or in a follow-up note if no commit is needed).
- [ ] **Step 5:** Stop the server. If Step 4 surfaced any wiring bug, fix it as a follow-up commit and re-run `npm test`.

---

## Definition of Done

Project is DONE when all of the following hold:

- [ ] `npm test` exits 0 with zero failures (full Vitest unit + integration suite, per Task 5 Step 1)
- [ ] `grep -rn "TODO\|TBD\|XXX\|FIXME" src/network/http/response/HttpResponse.ts src/network/http/response/mapErrorToResponse.ts src/network/http/response/pages.ts src/network/http/request/handleRequest.ts src/network/http/common/types.ts` returns nothing (Task 5 Step 2)
- [ ] `grep -rn "HttpResponse" src/network/http/common/` returns nothing — the interface is fully deleted (Task 5 Step 3, produced by Task 4)
- [ ] Manual: `curl -i http://localhost:<port>/` returns HTTP 200 with a `text/html` body containing the index template output (Task 5 Step 4)
- [ ] Manual: `curl -i http://localhost:<port>/missing` returns HTTP 404 with a `text/html` body containing the not-found template output (Task 5 Step 4)
- [ ] Manual: triggering a 5xx error path returns HTTP 500 with a `text/html` body containing the internal-error template output (Task 5 Step 4)
- [ ] `src/network/http/response/HttpResponse.ts` exists and exports the class described in the spec (Task 1)
- [ ] `src/network/http/common/types.ts` no longer contains any `HttpResponse` declaration (Task 4)
- [ ] `src/network/http/response/mapErrorToResponse.ts` and `src/network/http/request/handleRequest.ts` no longer import `renderHtml` (Tasks 2 and 3)
- [ ] Every task above is checked off and its own Acceptance Criteria verified
