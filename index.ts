import TCPListener from "./src/net/tcp/server/TCPListener.js";
import {serveClient} from "./src/net/http/server/serveClient.js";

async function main() {
    const listener = new TCPListener();
    listener.listen(1234);

    while (true) {
        const conn = await listener.accept();
        serveClient(conn).catch(console.error);
    }
}
main().catch(console.error);