export default class Timer {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private event: string,
        private timeout: number,
        private handler: () => void
    ) {}

    start(): void {
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = null;
                this.handler();
            }, this.timeout);
        }
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    reset(): void {
        this.stop();
        this.start();
    }
}