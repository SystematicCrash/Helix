import {HttpMethod} from "../common/constants.js";
import RadixNode, {type LookupResult, type SegmentKind} from "./RadixNode.js";
import type {RouteSpec} from "./Route.js";

/**
 * The compiled, immutable routing tree produced by `buildTree`. Once built,
 * every node is `Object.freeze`-ed and the wrapper itself is frozen; the
 * dispatcher treats the returned reference as read-only.
 */
export class RouteTree {
    public readonly root: RadixNode;

    constructor(root: RadixNode) {
        this.root = root;
        Object.freeze(this);
    }

    public lookup(
        method: HttpMethod,
        segments: ReadonlyArray<string>,
    ): LookupResult {
        return this.root.lookup(method, segments, 0, {});
    }
}

const IDENT_REGEX = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Normalizes a route path:
 * - must be non-empty and start with `/`,
 * - `''` and `'/'` collapse to the root,
 * - trailing slashes are stripped (root `/` is preserved).
 *
 * Throws on any input that doesn't follow these rules — build-time errors
 * fail loud on server start rather than surfacing as silent 404s later.
 */
export function normalizePath(path: string): string {
    if (path === "" || path === "/") return "/";
    if (!path.startsWith("/")) {
        throw new Error(`Route path must start with "/": "${path}"`);
    }
    return path.replace(/\/+$/, "");
}

/**
 * Splits a normalized path into segment descriptors consumed by the radix
 * tree's `insert` method. The wildcard-must-be-terminal rule is enforced here
 * because any wildcard past the final position would be unreachable.
 */
export function parseSegments(path: string): SegmentKind[] {
    if (path === "/") return [];

    const raw = path.slice(1).split("/");
    const out: SegmentKind[] = [];

    for (let i = 0; i < raw.length; i++) {
        const segment = raw[i];
        if (segment === undefined || segment === "") {
            throw new Error(`Empty path segment in "${path}"`);
        }

        const head = segment[0];
        if (head === ":") {
            const name = segment.slice(1);
            validateName(name, ":", path);
            out.push({kind: "param", name});
        } else if (head === "*") {
            const name = segment.slice(1);
            validateName(name, "*", path);
            if (i !== raw.length - 1) {
                throw new Error(
                    `Wildcard '*${name}' must be the terminal segment of "${path}"`,
                );
            }
            out.push({kind: "wildcard", name});
        } else {
            out.push({kind: "static", name: segment});
        }
    }

    return out;
}

function validateName(name: string, prefix: ":" | "*", path: string): void {
    if (name === "") {
        throw new Error(`Empty ${prefix === ":" ? "param" : "wildcard"} name in "${path}"`);
    }
    if (!IDENT_REGEX.test(name)) {
        throw new Error(
            `Invalid ${prefix === ":" ? "param" : "wildcard"} name "${name}" in "${path}" ` +
            `(must match ${IDENT_REGEX})`,
        );
    }
}

/**
 * Compiles a route list into an immutable radix tree. Validates every path,
 * catches duplicate (method, path) registrations, and freezes the resulting
 * tree so callers can't mutate it after build.
 */
export function buildTree(routes: ReadonlyArray<RouteSpec>): RouteTree {
    const root = new RadixNode();

    for (const spec of routes) {
        const normalized = normalizePath(spec.path);
        const segments = parseSegments(normalized);

        let node: RadixNode = root;
        for (const segment of segments) {
            node = node.insert(segment.name, segment);
        }

        if (node.handlers.has(spec.method)) {
            throw new Error(
                `Duplicate route: ${spec.method} ${spec.path}`,
            );
        }
        node.handlers.set(spec.method, spec.handler);
    }

    root.freeze();
    return new RouteTree(root);
}
