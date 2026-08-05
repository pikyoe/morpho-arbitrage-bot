import { Provider } from "ethers";

import { PoolCache } from "../scanner/PoolCache.js";
import { QuoteEngine } from "../scanner/QuoteEngine.js";

export class PriceOracle {

    constructor(

        private readonly provider: Provider,

        private readonly quoteEngine: QuoteEngine,

        private readonly cache: PoolCache,

        private readonly weth: string,

        private readonly usdc: string

    ) {}

    ////////////////////////////////////////////////////////
    // GAS PRICE
    ////////////////////////////////////////////////////////

    async getGasPrice(): Promise<bigint> {

        const feeData =
            await this.provider.getFeeData();

        if (feeData.gasPrice) {
            return feeData.gasPrice;
        }

        return 0n;

    }

    ////////////////////////////////////////////////////////
    // ETH PRICE
    ////////////////////////////////////////////////////////

    async getEthPriceUSD(): Promise<number> {

        //
        // Quote 1 WETH -> USDC
        //

        const quote =

            await this.quoteEngine.getBestQuote({

                tokenIn: this.weth,

                tokenOut: this.usdc,

                amountIn: 1_000_000_000_000_000_000n

            });

        if (!quote) {

            throw new Error(
                "Unable to determine ETH price."
            );

        }

        //
        // USDC memiliki 6 decimals
        //

        return Number(quote.amountOut) / 1e6;

    }

}