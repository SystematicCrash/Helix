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

export interface BodyReader {
    length: number;
    read: () => Promise<Buffer>;
}
