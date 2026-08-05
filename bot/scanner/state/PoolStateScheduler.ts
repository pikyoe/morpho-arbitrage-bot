import { PoolStateLoader } from "./PoolStateLoader.js";

export interface SchedulerOptions {

    intervalMs?: number;

    runImmediately?: boolean;

}

export class PoolStateScheduler {

    private timer?: NodeJS.Timeout;

    private running = false;

    constructor(

        private readonly loader: PoolStateLoader,

        private readonly options: SchedulerOptions = {}

    ) {}

    public start(): void {

        if (this.timer) {

            return;

        }

        const interval =

            this.options.intervalMs ?? 5000;

        if (

            this.options.runImmediately !== false

        ) {

            this.tick();

        }

        this.timer = setInterval(

            () => this.tick(),

            interval

        );

        console.log(

            `[PoolStateScheduler] Started (${interval} ms)`

        );

    }

    public stop(): void {

        if (!this.timer) {

            return;

        }

        clearInterval(this.timer);

        this.timer = undefined;

        console.log(

            "[PoolStateScheduler] Stopped"

        );

    }

    public isRunning(): boolean {

        return this.timer !== undefined;

    }

    private async tick(): Promise<void> {

        //
        // Hindari overlap refresh
        //

        if (this.running) {

            return;

        }

        this.running = true;

        const started = Date.now();

        try {

            await this.loader.refresh();

            const elapsed =

                Date.now() - started;

            console.log(

                `[PoolStateScheduler] Refresh completed (${elapsed} ms)`

            );

        }

        catch (err) {

            console.error(

                "[PoolStateScheduler]",

                err

            );

        }

        finally {

            this.running = false;

        }

    }

}