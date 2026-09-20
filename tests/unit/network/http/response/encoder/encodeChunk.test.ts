import { describe, it, expect } from 'vitest';
import { encodeChunk } from '../../../../../../src/network/http/response/encoder/encodeChunk.js';
import { CRLF } from '../../../../../../src/network/common/constants.js';

describe('encodeChunk', () => {
    it('should `encode simple data chunk`', () => {
        const data = Buffer.from('hello');
        const encoded = encodeChunk(data);
        // Size of 'hello' is 5 -> '5'
        // Format: '5' + CRLF + 'hello' + CRLF
        expect(encoded).toEqual(Buffer.concat([Buffer.from('5'), CRLF, data, CRLF]));
    });

    it('should `encode empty chunk as termination`', () => {
        const data = Buffer.alloc(0);
        const encoded = encodeChunk(data);
        // Size 0 -> '0'
        // Format: '0' + CRLF + CRLF
        expect(encoded).toEqual(Buffer.concat([Buffer.from('0'), CRLF, CRLF]));
    });

    it('should `encode longer chunk with hex size`', () => {
        // Size 20 -> '14'
        const data = Buffer.alloc(20, 'a');
        const encoded = encodeChunk(data);
        expect(encoded).toEqual(Buffer.concat([Buffer.from('14'), CRLF, data, CRLF]));
    });
});
