import {HttpMethod} from "../common/constants.js";
import type {RouteHandler} from "./RouteHandler.js";

/**
 * The discriminator returned from `RadixNode.lookup`.
 * - `found` carries the handler plus the path parameters extracted during traversal.
 * - `notFound` means no path in the tree matched.
 * - `methodNotAllowed` means a path matched but for a different method; `allowed`
 *    lists every method registered at the matched terminal node, used by the
 *    dispatcher to set the `Allow` response header.
 */
export type LookupResult =
    | {kind: "found"; handler: RouteHandler; params: Record<string, string>}
    | {kind: "notFound"}
    | {kind: "methodNotAllowed"; allowed: ReadonlyArray<HttpMethod>};

/**
 * Segment descriptor used during tree insertion.
 * - `static`: a literal segment that must match exactly.
 * - `param`: a `:name` segment that binds `params.name` to whatever value the
 *    request carried in that position (URI-decoded).
 * - `wildcard`: a `*name` terminal segment that greedily consumes the rest of
 *    the path and binds `params.name` to the remaining joined string.
 */
export type SegmentKind =
    | {kind: "static"; name: string}
    | {kind: "param"; name: string}
    | {kind: "wildcard"; name: string};

/**
 * One node in the radix tree. Each node holds:
 * - per-method handlers for the path that terminates at this node,
 * - static children keyed by segment name,
 * - at most one `:param` child,
 * - at most one `*wildcard` child.
 *
 * The tree is built once by `buildTree` and frozen. Handlers are looked up via
 * `lookup`, which traverses segments with backtracking across siblings.
 */
export default class RadixNode {
    public readonly handlers: Map<HttpMethod, RouteHandler> = new Map();
    public readonly staticChildren: Map<string, RadixNode> = new Map();
    public paramChild: RadixNode | null = null;
    public paramName: string | null = null;
    public wildcardChild: RadixNode | null = null;
    public wildcardName: string | null = null;

    /**
     * Inserts a segment into the tree and returns the node that now represents
     * the next segment after `segment`. The caller (buildTree) walks the route
     * one segment at a time and then registers the handler on the final node.
     */
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

        // wildcard
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

    /**
     * Walks the tree from this node matching `segments[index..]` for `method`.
     *
     * `params` is mutated during recursion and restored on backtrack — the
     * returned `LookupResult` carries a fresh copy so callers never see
     * partial bindings from a sibling branch.
     */
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
            // `result.params` (if found) is already a fresh copy taken inside the
            // deeper call — spreading the (now-restored) `params` here would
            // lose the binding.
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

    /**
     * Recursively freezes this node and every descendant so the tree cannot
     * be mutated after `buildTree` finishes compiling routes.
     */
    public freeze(): void {
        Object.freeze(this.handlers);
        for (const child of this.staticChildren.values()) child.freeze();
        Object.freeze(this.staticChildren);
        if (this.paramChild) this.paramChild.freeze();
        if (this.wildcardChild) this.wildcardChild.freeze();
        Object.freeze(this);
    }
}
