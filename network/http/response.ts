import {HttpResponse} from "./types";
import TCPConnection from "../tcp/TCPConnection";

export async function writeHttpResponse(conn: TCPConnection, response: HttpResponse): Promise<void> {
    // TODO: Write response to the socket
}
