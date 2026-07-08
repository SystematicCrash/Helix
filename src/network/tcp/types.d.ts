import TCPConnection from "./TCPConnection";

export interface DataReader {
    resolve(value: Buffer): void;
    reject(reason: Error): void;
}

export interface ConnectionReader {
    resolve(conn: TCPConnection): void;
    reject(err: Error): void;
}