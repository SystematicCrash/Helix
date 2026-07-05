import TCPListener from "./network/tcp/TCPListener";
import {serveClient} from "./network/tcp/server";

async function main() {
    const listener = new TCPListener();
    listener.listen(1234);
    const conn = await listener.accept();
    await serveClient(conn);
}
main().catch(console.error);