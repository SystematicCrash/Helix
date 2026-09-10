import {BodyReaderAbs} from "../request/body/BodyReaderAbs.js";

/** A single parsed chunk extension: a name with an optional value. */
export interface ChunkExtension {
    readonly name: string;
    readonly value: string | null;
}

export interface HttpRequest {
    method: string;
    url: string;
    version: string;
    headers: Map<string, string>;
}

export interface HttpResponse {
    code: number;
    version: string;
    headers: Map<string, string>;
    body: BodyReader;
}

export type BodyReader = BodyReaderAbs;
export type BufferGenerator = AsyncGenerator<Buffer, void, void>;
