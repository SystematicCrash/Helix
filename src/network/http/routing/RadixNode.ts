import {HttpMethod} from "../common/constants.js";
import {LookupResult, RouteHandler, SegmentKind} from "./types.js";

/** One node in the radix tree. Built once by `buildTree` and then frozen. */
export default class RadixNode {
    public readonly handlers: Map<HttpMethod, RouteHandler> = new Map();
    public readonly staticChildren: Map<string, RadixNode> = new Map();
    public paramChild: RadixNode | null = null;
    public paramName: string | null = null;
    public wildcardChild: RadixNode | null = null;
    public wildcardName: string | null = null;

    /** Inserts `segment` and returns the child node for the next segment in the path. */
    public insert(segment: string, kind: SegmentKind): RadixNode {
        if (kind.kind === "static") {
            const existing = this.staticChildren.get(kind.name);
            if (existing) return existing;
            const node = new RadixNode();
            this.staticChildren.set(kind.name, node);
            return node;
        }

        if (kind.kind === "param") {
            if (this.paramChild) {
                if (this.paramName !== kind.name) {
                    throw new Error(
                        `Conflicting param names at the same path level: ` +
                        `':${this.paramName}' vs ':${kind.name}'`,
                    );
                }
                return this.paramChild;
            }
            const node = new RadixNode();
            this.paramChild = node;
            this.paramName = kind.name;
            return node;
        }

        if (this.wildcardChild) {
            if (this.wildcardName !== kind.name) {
                throw new Error(
                    `Conflicting wildcard names at the same path level: ` +
                    `'*${this.wildcardName}' vs '*${kind.name}'`,
                );
            }
            return this.wildcardChild;
        }
        if (this.paramChild) {
            throw new Error(
                `A wildcard segment '*${kind.name}' cannot coexist with ` +
                `a :param segment ':${this.paramName}' at the same level`,
            );
        }
        const node = new RadixNode();
        this.wildcardChild = node;
        this.wildcardName = kind.name;
        return node;
    }

    /** Walks the tree matching `segments[index..]` for `method`, with backtracking across siblings. */
    public lookup(
        method: HttpMethod,
        segments: ReadonlyArray<string>,
        index: number,
        params: Record<string, string> = {},
    ): LookupResult {
        if (index === segments.length) {
            const handler = this.handlers.get(method);
            if (handler) {
                return {kind: "found", handler, params: {...params}};
            }
            if (this.handlers.size > 0) {
                return {kind: "methodNotAllowed", allowed: [...this.handlers.keys()]};
            }
            return {kind: "notFound"};
        }

        const segment = segments[index];
        if (segment === undefined) {
            return {kind: "notFound"};
        }

        const staticChild = this.staticChildren.get(segment);
        if (staticChild) {
            const result = staticChild.lookup(method, segments, index + 1, params);
            if (result.kind !== "notFound") return result;
        }

        if (this.paramChild && this.paramName !== null) {
            params[this.paramName] = decodeURIComponent(segment);
            const result = this.paramChild.lookup(method, segments, index + 1, params);
            delete params[this.paramName];
            if (result.kind !== "notFound") return result;
        }

        if (this.wildcardChild && this.wildcardName !== null) {
            const handler = this.wildcardChild.handlers.get(method);
            if (handler) {
                params[this.wildcardName] = decodeURIComponent(segments.slice(index).join("/"));
                const result = {kind: "found" as const, handler, params: {...params}};
                delete params[this.wildcardName];
                return result;
            }
            if (this.wildcardChild.handlers.size > 0) {
                return {
                    kind: "methodNotAllowed",
                    allowed: [...this.wildcardChild.handlers.keys()],
                };
            }
            return {kind: "notFound"};
        }

        return {kind: "notFound"};
    }

    /** Recursively freezes this node and every descendant so the tree can't be mutated. */
    public freeze(): void {
        Object.freeze(this.handlers);
        for (const child of this.staticChildren.values()) child.freeze();
        Object.freeze(this.staticChildren);
        if (this.paramChild) this.paramChild.freeze();
        if (this.wildcardChild) this.wildcardChild.freeze();
        Object.freeze(this);
    }
}
