import {HttpMethod} from "../common/constants.js";
import type {RouteHandler} from "./RouteHandler.js";

/** Frozen (path, method, handler) triple consumed by `buildTree`. */
export interface RouteSpec {
    readonly path: string;
    readonly method: HttpMethod;
    readonly handler: RouteHandler;
}

/** Fluent builder for one route. `toSpec()` throws if method or handler is missing. */
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
