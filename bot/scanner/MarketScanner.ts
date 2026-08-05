import { MarketPairScanner } from "./MarketPairScanner.js";
import { ArbitrageCandidate } from "./MarketPairScanner.js";

export class MarketScanner {

    constructor(

        private readonly pairScanner: MarketPairScanner,

        private readonly tokens: string[]

    ) {}

    public async scanAll(): Promise<ArbitrageCandidate[]> {

        const opportunities: ArbitrageCandidate[] = [];

        for (let i = 0; i < this.tokens.length; i++) {

            for (let j = i + 1; j < this.tokens.length; j++) {

                const tokenA = this.tokens[i];
                const tokenB = this.tokens[j];

                console.log();
                console.log("----------------------------------------");
                console.log("Scanning");
                console.log(tokenA);
                console.log(tokenB);

                const result =
                    await this.pairScanner.scan(
                        tokenA,
                        tokenB
                    );

                opportunities.push(...result);

            }

        }

        opportunities.sort(

            (a, b) =>

                (b.netProfitUSD ?? -Infinity)

                -

                (a.netProfitUSD ?? -Infinity)

        );

        return opportunities;

    }

}