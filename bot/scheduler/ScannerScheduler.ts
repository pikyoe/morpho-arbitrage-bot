import { ArbitrageCandidate } from "../scanner/MarketPairScanner.js";

export interface Scanner {

    scanAll(): Promise<ArbitrageCandidate[]>;

}

export interface ScannerHandler {

    onScanFinished(

        opportunities: ArbitrageCandidate[]

    ): Promise<void>;

}

export class ScannerScheduler {

    private timer?: NodeJS.Timeout;

    private running = false;

    constructor(

        private readonly scanner: Scanner,

        private readonly handler: ScannerHandler,

        private readonly interval = 2000

    ) {}

    public start() {

        console.log();

        console.log("==============================");

        console.log("Scanner Scheduler Started");

        console.log("==============================");

        this.timer = setInterval(

            () => this.tick(),

            this.interval

        );

        this.tick();

    }

    public stop() {

        if (this.timer) {

            clearInterval(this.timer);

        }

    }

    private async tick() {

        if (this.running) {

            return;

        }

        this.running = true;

        try {

            const result =

                await this.scanner.scanAll();

            await this.handler.onScanFinished(

                result

            );

        }

        catch (err) {

            console.error(err);

        }

        finally {

            this.running = false;

        }

    }

}