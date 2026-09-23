import {HttpMethod} from "../common/constants.js";
import {Route} from "./Route.js";
import {Group} from "./Group.js";
import {buildTree, RouteTree} from "./buildTree.js";
import {RouteHandler, RouteSpec} from "./types.js";

/** Top-level router. Build once at server start; the tree is frozen afterward. */
export default class Router {
    private _routes: RouteSpec[] = [];

    public get routes(): ReadonlyArray<RouteSpec> {
        return this._routes;
    }

    public get(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.GET);
    }

    public post(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.POST);
    }

    public put(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.PUT);
    }

    public patch(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.PATCH);
    }

    public delete(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.DELETE);
    }

    public head(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.HEAD);
    }

    public options(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.OPTIONS);
    }

    public any(path: string, handler: RouteHandler): this {
        return this.add(path, handler, HttpMethod.ANY);
    }

    public setRoute(path: string, handler: RouteHandler, methods: HttpMethod[]): this {
        return this.add(path, handler, ...methods);
    }

    public group(prefix: string): Group {
        return new Group(this._routes, prefix);
    }

    public build(): RouteTree {
        return buildTree(this._routes);
    }

    private add(path: string, handler: RouteHandler, ...methods: HttpMethod[]): this {
        const spec = new Route(path).methods(methods).handler(handler).toSpec();
        this._routes.push(spec);
        return this;
    }
}
