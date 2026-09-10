export default class Timer {
    private timer: NodeJS.Timeout | null = null;

    constructor(
        private event: string,
        private timeout: number,
        private handler: (event: string) => void
    ) {}

    start(): void {
        if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = null;
                this.handler(this.event);
            }, this.timeout);
        }
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    restart(): void {
        this.stop();
        this.start();
    }
}