import {DEC_DIGITS} from "../../common/constants.js";
import {ByteRange} from "../../../../common/types.js";

export function parseRangeHeader(rangeHeader: string | undefined): ByteRange | null {
    if (!rangeHeader) return null;

    const trimmed = rangeHeader.trim();
    if (!trimmed.startsWith("bytes=")) return null;

    const spec = trimmed.slice("bytes=".length).trim();

    if (spec.includes(",")) return null;

    const dashIndex = spec.indexOf("-");
    if (dashIndex === -1) return null;

    const startRaw = spec.slice(0, dashIndex).trim();
    const endRaw = spec.slice(dashIndex + 1).trim();

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