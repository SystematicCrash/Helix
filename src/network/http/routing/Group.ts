import {HttpMethod} from "../common/constants.js";
import {Route, type RouteSpec} from "./Route.js";
import type {RouteHandler} from "./RouteHandler.js";

/**
 * A prefix-aware sub-router. Created by `router.group(prefix)` or by chaining
 * `group.group(prefix)`. Shares the parent router's backing route list, so
 * routes added through a group land in the same compiled tree at build time.
 *
 * The shared `routes` reference (not a copy) is what makes nesting work
 * without copying — every level pushes into the same array, and `build()`
 * sees the flattened result.
 */
export class Group {
    constructor(
        private readonly _routes: RouteSpec[],
        private readonly prefix: string,
    ) {}

    /** Read-only view of the shared route list, mirroring `Router.routes`. */
    public get routes(): ReadonlyArray<RouteSpec> {
        return this._routes;
    }

    public get(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.GET, path, handler);
    }
    public post(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.POST, path, handler);
    }
    public put(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.PUT, path, handler);
    }
    public patch(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.PATCH, path, handler);
    }
    public delete(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.DELETE, path, handler);
    }
    public head(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.HEAD, path, handler);
    }
    public options(path: string, handler: RouteHandler): this {
        return this.add(HttpMethod.OPTIONS, path, handler);
    }

    /**
     * Opens a nested group. The new group's prefix is the join of this group's
     * prefix and the supplied path, so nesting is additive.
     */
    public group(prefix: string): Group {
        return new Group(this._routes, this.join(prefix));
    }

    /**
     * Joins a relative path to this group's prefix, normalizing so the result
     * has exactly one `/` between them and never a double `/`. An empty prefix
     * is allowed at the top level; a trailing slash on the prefix is stripped.
     *
     *   `/api` + `/users`   → `/api/users`
     *   `/api` + `users`    → `/api/users`
     *   `/api/` + `/users`  → `/api/users`
     *   ``     + `/users`   → `/users`
     */
    private join(path: string): string {
        const left = this.prefix.endsWith("/")
            ? this.prefix.slice(0, -1)
            : this.prefix;
        const right = path.startsWith("/") ? path : "/" + path;
        return left + right;
    }

    private add(method: HttpMethod, path: string, handler: RouteHandler): this {
        const fullPath = this.join(path);
        const spec = new Route(fullPath).method(method).handler(handler).toSpec();
        this._routes.push(spec);
        return this;
    }
}
