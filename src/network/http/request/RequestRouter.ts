import {BodyReader, HttpRequest, HttpResponse} from "../common/types.js";
import GeneratorBodyReader from "./body/GeneratorBodyReader.js";
import {memoryReader} from "./body/MemoryBodyReader.js";

type BufferGenerator = AsyncGenerator<Buffer, void, void>;

async function* countSheep(): BufferGenerator {
    for (let i = 1; i <= 10; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        yield Buffer.from(`count: ${i}\n`);
    }
}

/**
 * TODO: This is just a toy and should be changed in the real product.
 * Routes the request to the appropriate handler and returns an HTTP response.
 */
export async function handleRequest(request: HttpRequest, body: BodyReader): Promise<HttpResponse> {
    let payload: BodyReader;

    switch (request.url) {
        case '/echo':
            payload = body;
            break;
        case '/sheep':
            payload = new GeneratorBodyReader(countSheep());
            break;
        default:
            payload = memoryReader(Buffer.from('Hello world!'));
            break;
    }

    return {
        code: 200,
        version: request.version,
        headers: new Map([['Server', 'Helix WebServer']]),
        body: payload,
    };
}
