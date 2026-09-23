import {HttpMethod} from "../common/constants.js";
import {Route, type RouteSpec} from "./Route.js";
import {Group} from "./Group.js";
import {buildTree, RouteTree} from "./buildTree.js";
import type {RouteHandler} from "./RouteHandler.js";

/**
 * The top-level router. Holds the backing route list, exposes chainable
 * method shortcuts (same surface as `Group`, without prefix joining), opens
 * nested `Group`s via `.group(prefix)`, and compiles the whole route table
 * into a frozen `RouteTree` via `.build()`.
 *
 * Build once at server start, then hand the tree to the dispatcher. Adding
 * routes after `.build()` does not retroactively recompile the tree; the
 * pattern is: register everything, then call `.build()` exactly once.
 */
export default class Router {
    private _routes: RouteSpec[] = [];

    /** Read-only view of every route registered so far, in registration order. */
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

    public group(prefix: string): Group {
        return new Group(this._routes, prefix);
    }

    public build(): RouteTree {
        return buildTree(this._routes);
    }

    private add(method: HttpMethod, path: string, handler: RouteHandler): this {
        const spec = new Route(path).method(method).handler(handler).toSpec();
        this._routes.push(spec);
        return this;
    }
}
