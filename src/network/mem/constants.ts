export const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

export enum BufferErrCode {
    MAX_SIZE_EXCEEDED = 'Buffer maximum size exceeded!',
    VIEW_EXCEEDED = 'Cannot cut bytes, only available bytes are present',
    CLEAR_EXCEEDED = 'Cannot clear bytes, only available bytes are present',
}
