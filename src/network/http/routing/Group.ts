import {HttpMethod} from "../common/constants.js";
import {Route} from "./Route.js";
import {RouteHandler, RouteSpec} from "./types.js";
import {RouteBuilder} from "./RouteBuilder.js";

/** Prefix-aware sub-router sharing the parent router's backing route list. */
export class Group extends RouteBuilder {
    constructor(
        public readonly routes: RouteSpec[],
        private readonly prefix: string,
    ) {
        super();
    }

    /** Opens a nested group; the new prefix is this group's prefix joined with `prefix`. */
    public group(prefix: string): Group {
        return new Group(this.routes, this.join(prefix));
    }

    /** Joins `path` onto `prefix` with exactly one `/` between them. */
    private join(path: string): string {
        const left = this.prefix.endsWith("/")
            ? this.prefix.slice(0, -1)
            : this.prefix;
        const right = path.startsWith("/") ? path : "/" + path;
        return left + right;
    }

    protected add(path: string, handler: RouteHandler, ...method: HttpMethod[]): this {
        const spec = new Route(this.join(path))
            .methods(method)
            .handler(handler)
            .toSpec();
        this.routes.push(spec);
        return this;
    }
}
