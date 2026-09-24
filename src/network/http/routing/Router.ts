import {HttpMethod} from "../common/constants.js";
import {Route} from "./Route.js";
import {Group} from "./Group.js";
import {buildTree, RouteTree} from "./buildTree.js";
import {RouteHandler, RouteSpec} from "./types.js";
import {RouteBuilder} from "./RouteBuilder.js";

/** Top-level router. Build once at server start; the tree is frozen afterward. */
export default class Router extends RouteBuilder {
    private _routes: RouteSpec[] = [];

    public get routes(): RouteSpec[] {
        return this._routes;
    }

    public group(prefix: string): Group {
        return new Group(this._routes, prefix);
    }

    public build(): RouteTree {
        return buildTree(this._routes);
    }

    protected add(path: string, handler: RouteHandler, ...methods: HttpMethod[]): this {
        const spec = new Route(path).methods(methods).handler(handler).toSpec();
        this._routes.push(spec);
        return this;
    }
}
