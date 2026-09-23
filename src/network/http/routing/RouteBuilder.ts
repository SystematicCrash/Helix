import {HttpMethod} from "../common/constants.js";
import {RouteHandler, RouteSpec} from "./types.js";

/** Base class for shared route registration functionality. */
export abstract class RouteBuilder {
    protected abstract readonly routes: RouteSpec[];

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

    protected abstract add(path: string, handler: RouteHandler, ...methods: HttpMethod[]): this;
}
