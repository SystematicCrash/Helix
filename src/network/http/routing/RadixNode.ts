import RouteHandler from "./RouteHandler.js";

export default class RadixNode {
    public handler: RouteHandler | null = null;
    public staticChildren = new Map<string, RadixNode>();

    public paramChild: RadixNode | null = null;
    public paramName: string | null = null;

    public wildcardChild: RadixNode | null = null;
    public wildcardName: string | null = null;

    /**
     * Traverses the tree matching segments one by one with backtracking.
     */
    public find(segments: string[], index: number, params: Record<string, string>): RouteHandler | null {
        if (index === segments.length) {
            return this.handler;
        }

        const segment = segments[index]!;

        const staticChild = this.staticChildren.get(segment);
        if (staticChild) {
            const result = staticChild.find(segments, index + 1, params);
            if (result !== null) {
                return result;
            }
        }

        if (this.paramChild) {
            params[this.paramName!] = decodeURIComponent(segment);

            const result = this.paramChild.find(segments, index + 1, params);
            if (result !== null) {
                return result;
            }

            delete params[this.paramName!];
        }

        if (this.wildcardChild) {
            const remaining = segments.slice(index).join('/');
            params[this.wildcardName!] = decodeURIComponent(remaining);
            return this.wildcardChild.handler;
        }

        return null;
    }
}