import {HttpMethod} from "../common/constants.js";
import type {RouteHandler} from "./RouteHandler.js";

/**
 * The fully-described, immutable form of a single route, produced by the
 * `Route` fluent builder when both `.method()` and `.handler()` have been
 * called. The router collects `RouteSpec` values and hands them to
 * `buildTree` for compilation.
 */
export interface RouteSpec {
    readonly path: string;
    readonly method: HttpMethod;
    readonly handler: RouteHandler;
}

/**
 * Fluent builder for a single route. The builder is intentionally *not* the
 * value passed to `buildTree` — `toSpec()` seals the path/method/handler
 * triple into a `RouteSpec` and throws if anything is missing. This means a
 * router that forgets to call `.handler()` fails loud at build time instead
 * of silently registering a route with `handler === undefined`.
 */
export class Route {
    private _method: HttpMethod | null = null;
    private _handler: RouteHandler | null = null;

    constructor(public readonly path: string) {}

    public method(method: HttpMethod): this {
        this._method = method;
        return this;
    }

    public handler(handler: RouteHandler): this {
        this._handler = handler;
        return this;
    }

    public toSpec(): RouteSpec {
        if (this._method === null) {
            throw new Error(`Route "${this.path}" is missing a method`);
        }
        if (this._handler === null) {
            throw new Error(`Route "${this.path}" is missing a handler`);
        }
        return {path: this.path, method: this._method, handler: this._handler};
    }
}
