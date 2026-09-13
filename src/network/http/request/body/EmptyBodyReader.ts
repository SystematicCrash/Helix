import {BodyReader} from "./BodyReader.js";

/**
 * Returns a BodyReader that signals EOF immediately, with no body bytes.
 *
 * Used for requests with no body framing (no Content-Length, no Transfer-Encoding)
 * — typically GET/HEAD but also any HTTP/1.1 request that arrives without an
 * explicit body length. RFC 9112 §6: when neither framing header is present,
 * the message body has length zero.
 */
export default class EmptyBodyReader extends BodyReader {
    public readonly hasLength: boolean = true;

    constructor() {
        super();
        this.length = 0;
    }

    async read(_target?: Buffer): Promise<Buffer | null | number> {
        return null;
    }
}
