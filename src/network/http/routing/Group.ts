import {HttpMethod} from "../common/constants.js";
import {Route} from "./Route.js";
import {RouteHandler, RouteSpec} from "./types.js";

/** Prefix-aware sub-router sharing the parent router's backing route list. */
export class Group {
    constructor(
        private readonly _routes: RouteSpec[],
        private readonly prefix: string,
    ) {}

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

    /** Opens a nested group; the new prefix is this group's prefix joined with `prefix`. */
    public group(prefix: string): Group {
        return new Group(this._routes, this.join(prefix));
    }

    /** Joins `path` onto `prefix` with exactly one `/` between them. */
    private join(path: string): string {
        const left = this.prefix.endsWith("/")
            ? this.prefix.slice(0, -1)
            : this.prefix;
        const right = path.startsWith("/") ? path : "/" + path;
        return left + right;
    }

    private add(method: HttpMethod, path: string, handler: RouteHandler): this {
        const spec = new Route(this.join(path))
            .method(method)
            .handler(handler)
            .toSpec();
        this._routes.push(spec);
        return this;
    }
}
