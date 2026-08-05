import { ArbitrageCandidate } from "./MarketPairScanner.js";
import { MarketPairScanner } from "./MarketPairScanner.js";

export class ParallelMarketScanner {

    constructor(

        private readonly pairScanner: MarketPairScanner,

        private readonly tokens: string[],

        private readonly concurrency = 5

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

        let index = 0;

        while (index < jobs.length) {

            const batch = jobs.slice(

                index,

                index + this.concurrency

            );

            const scanned = await Promise.all(

                batch.map(

                    job => job()

                )

            );

            result.push(

                ...scanned.flat()

            );

            index += this.concurrency;

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