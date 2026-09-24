import { ContentType } from "../../common/constants.js";

interface AcceptEntry {
    type: ContentType;
    q: number;
    index: number;
}

const VALID_CONTENT_TYPES = new Set<string>(Object.values(ContentType));

/**
 * Parses an HTTP Accept header string into an array of recognized ContentType enum values,
 * sorted in descending order of client preference (q-value).
 */
export function parseAcceptHeader(header: string | undefined): ContentType[] {
    if (!header) return [];

    const entries: AcceptEntry[] = [];
    const parts = header.split(",");

    for (let i = 0; i < parts.length; i++) {
        const rawPart = parts[i]?.trim();
        if (!rawPart) continue;

        const params = rawPart.split(";");
        const mime = params[0]?.trim().toLowerCase();
        if (!mime) continue;

        let q = 1.0;
        for (let j = 1; j < params.length; j++) {
            const param = params[j]?.trim().toLowerCase();
            if (param?.startsWith("q=")) {
                const parsedQ = parseFloat(param.slice(2));
                if (!Number.isNaN(parsedQ) && parsedQ >= 0 && parsedQ <= 1) {
                    q = parsedQ;
                }
                break;
            }
        }

        if (q === 0) continue;

        if (VALID_CONTENT_TYPES.has(mime)) {
            entries.push({
                type: mime as ContentType,
                q,
                index: i,
            });
        }
    }

    entries.sort((a, b) => b.q - a.q || a.index - b.index);
    return entries.map((entry) => entry.type);
}