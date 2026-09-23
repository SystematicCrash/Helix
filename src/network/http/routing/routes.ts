import Router from "./Router.js";
import {indexPageHandler, echoHandler, filesHandler} from "../handlers.js";

/**
 * Concrete route table for the HTTP server. Wired in by `HttpServer.listen`
 * after the listener address is known; the resulting tree is what the
 * dispatcher in `RequestRouter` walks.
 *
 * This file owns the URL ↔ handler mapping only; the handler implementations
 * themselves live in `http/handlers.ts`. Add a new route by defining the
 * handler there and registering it here.
 */
export default (router: Router): void => {
    router
        .get("/", indexPageHandler)
        .get("/index.html", indexPageHandler)
        .get("/echo", echoHandler);

    router.group("/files").get("/*filepath", filesHandler);
};
