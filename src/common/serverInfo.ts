import type { ServerInfo } from "./types.js";

let currentServerInfo: ServerInfo | null = null;

export function setServerInfo(info: ServerInfo): void {
    if (currentServerInfo) {
        throw new Error("ServerInfo has already been initialized");
    }
    currentServerInfo = Object.freeze({ ...info });
}

export function getServerInfo(): ServerInfo {
    if (!currentServerInfo) {
        throw new Error("ServerInfo has not been initialized yet");
    }
    return currentServerInfo;
}