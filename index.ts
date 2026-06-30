import {listen, accept, serveClient} from "./tcp/listener";

async function main() {
    const listener = listen(1234);
    const conn = await accept(listener);
    await serveClient(conn);
}
main().catch(console.error);