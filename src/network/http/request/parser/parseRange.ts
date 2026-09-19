import {DEC_DIGITS, MAX_RANGES_LIMIT} from "../../common/constants.js";
import { ByteRange } from "../../../../common/types.js";

/**
 * Parses a single byte-range specification:
 * - Suffix: "-500"
 * - Open-ended: "500-"
 * - Closed: "0-499"
 */
function parseSingleRange(item: string): ByteRange | null {
    const dashIndex = item.indexOf("-");
    if (dashIndex === -1) return null;

    const startRaw = item.slice(0, dashIndex).trim();
    const endRaw = item.slice(dashIndex + 1).trim();

    if (startRaw === "" && endRaw === "") return null;

    if (startRaw === "" && endRaw !== "") {
        if (!DEC_DIGITS.test(endRaw)) return null;
        const suffix = Number(endRaw);
        if (suffix === 0) return null;
        return { end: -1, suffix };
    }

    if (startRaw !== "" && endRaw === "") {
        if (!DEC_DIGITS.test(startRaw)) return null;
        const start = Number(startRaw);
        return { start, end: -1 };
    }

    if (!DEC_DIGITS.test(startRaw) || !DEC_DIGITS.test(endRaw)) return null;

    const start = Number(startRaw);
    const end = Number(endRaw);

    if (start > end) return null;

    return { start, end };
}

/**
 * Parses an HTTP Range header supporting single and comma-separated range sets.
 * Returns an array of ByteRange objects, or null if invalid or unsupported.
 */
export function parseRangeHeader(rangeHeader: string | undefined): ByteRange[] | null {
    if (!rangeHeader) return null;

    const trimmed = rangeHeader.trim();
    if (!trimmed.startsWith("bytes=")) return null;

    const spec = trimmed.slice("bytes=".length).trim();
    if (spec === "") return null;

    const parts = spec.split(",");
    if (parts.length > MAX_RANGES_LIMIT) return null;

    const ranges: ByteRange[] = [];

    for (const rawPart of parts) {
        const item = rawPart.trim();
        if (item === "") return null;

        const parsed = parseSingleRange(item);
        if (!parsed) return null;

        ranges.push(parsed);
    }

    return ranges.length > 0 ? ranges : null;
}