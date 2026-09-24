import Router from "../network/http/routing/Router.js";
import {indexPageHandler, echoHandler, filesHandler} from "./handlers.js";
import {HttpMethod} from "../network/http/common/constants.js";

/** Concrete URL ↔ handler table consumed by `HttpServer.listen`. */
export default (router: Router): void => {
    const {GET, HEAD, OPTIONS} = HttpMethod;

    router
        .get("/", indexPageHandler)
        .get("/index.html", indexPageHandler)
        .get("/echo", echoHandler);

    router.group("/files")
        .setRoute("/*filepath", filesHandler, [GET, HEAD, OPTIONS]);
};
