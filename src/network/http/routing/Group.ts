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

    private add(path: string, handler: RouteHandler, ...method: HttpMethod[]): this {
        const spec = new Route(this.join(path))
            .methods(method)
            .handler(handler)
            .toSpec();
        this._routes.push(spec);
        return this;
    }
}
