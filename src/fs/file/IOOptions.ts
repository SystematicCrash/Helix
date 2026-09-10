import {DEFAULT_READ_LENGTH, FsErrCode} from "../common/constants.js";
import FsError from "../common/FsError.js";
import {IOOptions, RawIOOptions} from "../common/types.js";

/** Normalizes and validates read options. Throws FsError(INVALID_ARGUMENT) on bad input. */
export function resolveIOOptions(opts: RawIOOptions | undefined): IOOptions {
    const o: RawIOOptions = opts ?? {};
    if (typeof o.offset === 'number' && (o.offset < 0 || !Number.isInteger(o.offset)))
        throw FsError.from(FsErrCode.INVALID_ARGUMENT, `read offset must be a non-negative integer`);
    if (typeof o.length === 'number' && (o.length <= 0 || !Number.isInteger(o.length)))
        throw FsError.from(FsErrCode.INVALID_ARGUMENT, `read length must be a positive integer`);
    if (o.position !== undefined && o.position !== null && (!Number.isInteger(o.position) || o.position < 0))
        throw FsError.from(FsErrCode.INVALID_ARGUMENT, `read position must be a non-negative integer or null`);
    if (o.buffer !== undefined && !Buffer.isBuffer(o.buffer))
        throw FsError.from(FsErrCode.INVALID_ARGUMENT, `read buffer must be a Buffer type`);

    const offset = o.offset ?? 0;
    const buffer = o.buffer ?? Buffer.alloc(o.length ?? DEFAULT_READ_LENGTH);
    const length = o.length ?? Math.max(0, buffer.length - offset);
    if (length > buffer.length - offset)
        throw FsError.from(FsErrCode.INVALID_ARGUMENT, `read length ${length} exceeds buffer space ${buffer.length - offset}`);

    return {buffer, offset, length, position: o.position === undefined ? null : o.position};
}
