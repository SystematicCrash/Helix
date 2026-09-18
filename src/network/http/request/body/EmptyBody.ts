import {HttpBody} from "./HttpBody.js";

export default class EmptyBody extends HttpBody {

    protected async pullBytes(): Promise<Buffer | null> {
        return null;
    }
}