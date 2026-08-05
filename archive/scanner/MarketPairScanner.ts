import { QuoteEngine } from "./QuoteEngine.js";

import {
    QuoteRequest,
    QuoteResult
} from "./quote/index.js";

export interface ArbitrageCandidate {
    forward: QuoteResult;
    reverse: QuoteResult;
    amountIn: bigint;
    amountBack: bigint;
    profit: bigint;
}

export class MarketPairScanner {

    constructor(
        private quoteEngine: QuoteEngine
    ) {}

    public async scan(
        tokenA: string,
        tokenB: string,
        amountIn: bigint
    ): Promise<ArbitrageCandidate[]> {

        const candidates: ArbitrageCandidate[] = [];

        const forwardQuotes = await this.quoteEngine.getAllQuotes({
            tokenIn: tokenA,
            tokenOut: tokenB,
            amountIn
        });

        for (const forward of forwardQuotes) {

            const reverseQuotes = await this.quoteEngine.getAllQuotes({
                tokenIn: tokenB,
                tokenOut: tokenA,
                amountIn: forward.amountOut
            });

            for (const reverse of reverseQuotes) {

                const amountBack = reverse.amountOut;
                const profit = amountBack - amountIn;

                candidates.push({
                    forward,
                    reverse,
                    amountIn,
                    amountBack,
                    profit
                });

            }

        }

        candidates.sort((a, b) => Number(b.profit - a.profit));

        return candidates;

    }

}
