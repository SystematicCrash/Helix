import {HttpBody} from "./HttpBody.js";

export default class EmptyBody extends HttpBody {
    constructor() {
        super();
        this.length = 0;
    }

    protected async pullBytes(): Promise<Buffer | null> {
        return null;
    }
}