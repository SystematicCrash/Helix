import TCPConnection from "../../../../src/network/tcp/TCPConnection.js";
import {vi} from "vitest";

export function getMockedConnection(): TCPConnection {
    return {
        read: vi.fn().mockResolvedValue(Buffer.from('')),
        write: vi.fn().mockResolvedValue(undefined),
        socket: {} as any,
    } as unknown as TCPConnection;

}