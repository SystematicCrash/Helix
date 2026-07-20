import {EventEmitter} from "events";

export default class Timer {
    private timer: NodeJS.Timeout|null = null;
    private emitter: EventEmitter = new EventEmitter();

    constructor(
        private event: string,
        private timeout: number,
        private handler: () => void
    ) {
        this.emitter.on(this.event, this.handler);
    }

    start(): void {
        this.timer = setTimeout(() => this.emitter.emit(this.event), this.timeout);
    }

    stop(): void {
        if (this.timer) clearTimeout(this.timer);
    }

    reset(): void {
        this.stop();
        this.start();
    }
}