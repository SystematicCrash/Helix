import {HttpMethod} from "../common/constants.js";
import {Route, type RouteSpec} from "./Route.js";
import {Group} from "./Group.js";
import {buildTree, RouteTree} from "./buildTree.js";
import type {RouteHandler} from "./RouteHandler.js";

/** Top-level router. Build once at server start; the tree is frozen afterwards. */
export default class Router {
    private _routes: RouteSpec[] = [];

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
