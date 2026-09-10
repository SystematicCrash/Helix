/** Single-byte ASCII protocol delimiters, stored as Buffers for direct byte comparison. */
export const LF = Buffer.from([0x0A]);
export const CR = Buffer.from([0x0D]);
export const SP = Buffer.from([0x20]);
export const HTAB = Buffer.from([0x09]);
export const DQ = Buffer.from([0x22]);
export const BS = Buffer.from([0x5C]);

/** Two-byte CRLF sequence used for HTTP line endings. */
export const CRLF = Buffer.from([0x0D, 0x0A]);
