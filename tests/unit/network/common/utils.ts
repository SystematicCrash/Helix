import {TCPConnection} from "../../../../src/network/tcp";
import {vi} from "vitest";
import {spyOn} from "@vitest/spy";

export function mockedTCPConnection(): TCPConnection {
    return {
        read: vi.fn().mockResolvedValue(Buffer.from('')),
        write: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        socket: {} as any,
    } as unknown as TCPConnection;
}