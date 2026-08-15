import { setTimeout as sleep } from "timers/promises";
import { ArbitrageCandidate } from "./MarketPairScanner.js";

export interface IPairScanner {
    scan(tokenA: string, tokenB: string, defaultAmount?: bigint): Promise<ArbitrageCandidate[]>;
}

export class ParallelMarketScanner {

    constructor(

        private readonly pairScanner: IPairScanner,

        private readonly tokens: string[],

        private readonly concurrency = 1

    ) {}

    public async scanAll(): Promise<ArbitrageCandidate[]> {

        const jobs: Array<() => Promise<ArbitrageCandidate[]>> = [];

        for (let i = 0; i < this.tokens.length; i++) {

            for (let j = i + 1; j < this.tokens.length; j++) {

                const tokenA = this.tokens[i];
                const tokenB = this.tokens[j];

                jobs.push(async () => {

                    console.log(
                        `Scanning ${tokenA} -> ${tokenB}`
                    );

                    return this.pairScanner.scan(
                        tokenA,
                        tokenB
                    );

                });

            }

        }

        const result: ArbitrageCandidate[] = [];
        const delayMs = Math.max(50, Math.min(200, Math.floor(1000 / Math.max(1, this.concurrency))));

        let index = 0;
        while (index < jobs.length) {
            const batch = jobs.slice(index, index + this.concurrency);
            for (const job of batch) {
                try {
                    const scanned = await job();
                    result.push(...scanned);
                } catch (error) {
                    console.warn(
                        "Market pair scan failed, skipping pair:",
                        error
                    );
                }
            }

            index += this.concurrency;
            if (index < jobs.length) {
                await sleep(delayMs);
            }
        }

        result.sort(

            (a, b) =>

                (b.netProfitUSD ?? -Infinity)

                -

                (a.netProfitUSD ?? -Infinity)

        );

        return result;

    }

}