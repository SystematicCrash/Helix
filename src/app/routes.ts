import Router from "../network/http/routing/Router.js";
import {indexPageHandler, echoHandler, filesHandler} from "./handlers.js";

/** Concrete URL ↔ handler table consumed by `HttpServer.listen`. */
export default (router: Router): void => {
    router
        .get("/", indexPageHandler)
        .get("/index.html", indexPageHandler)
        .get("/echo", echoHandler);

    router.group("/files").get("/*filepath", filesHandler);
};
