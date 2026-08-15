import { Provider } from "ethers";

import { PoolCache } from "../scanner/PoolCache.js";
import { QuoteEngine } from "../scanner/QuoteEngine.js";

export class PriceOracle {
    private lastEthPriceUSD?: number;
    private lastEthPriceTimestamp?: number;
    private readonly PRICE_CACHE_TTL_MS = 300_000; // 5 minutes
    private readonly envFallbackEthPriceUSD?: number;

    constructor(

        private readonly provider: Provider,

        private readonly quoteEngine: QuoteEngine,

        private readonly cache: PoolCache,

        private readonly weth: string,

        private readonly usdc: string

    ) {
        const envValue = process.env.ETH_PRICE_USD_FALLBACK;
        if (envValue) {
            const parsed = Number(envValue);
            if (!Number.isNaN(parsed) && parsed > 0) {
                this.envFallbackEthPriceUSD = parsed;
            }
        }
    }

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
        const now = Date.now();
        if (
            this.lastEthPriceUSD !== undefined &&
            this.lastEthPriceTimestamp !== undefined &&
            now - this.lastEthPriceTimestamp < this.PRICE_CACHE_TTL_MS
        ) {
            return this.lastEthPriceUSD;
        }

        const baseAmount = 1_000_000_000_000_000_000n;

        const quote = await this.quoteEngine.getBestQuote({
            tokenIn: this.weth,
            tokenOut: this.usdc,
            amountIn: baseAmount
        });

        if (quote && quote.amountOut > 0n) {
            const price = Number(quote.amountOut) / 1e6;
            this.lastEthPriceUSD = price;
            this.lastEthPriceTimestamp = now;
            return price;
        }

        const reverseQuote = await this.quoteEngine.getBestQuote({
            tokenIn: this.usdc,
            tokenOut: this.weth,
            amountIn: 1_000_000n
        });

        if (reverseQuote && reverseQuote.amountOut > 0n) {
            const wethAmount = Number(reverseQuote.amountOut) / 1e18;
            if (wethAmount > 0) {
                const price = 1 / wethAmount;
                this.lastEthPriceUSD = price;
                this.lastEthPriceTimestamp = now;
                return price;
            }
        }

        if (this.envFallbackEthPriceUSD && this.envFallbackEthPriceUSD > 0) {
            console.warn("Using ETH price fallback from environment:", this.envFallbackEthPriceUSD);
            this.lastEthPriceUSD = this.envFallbackEthPriceUSD;
            this.lastEthPriceTimestamp = now;
            return this.envFallbackEthPriceUSD;
        }

        const errorMessage = [
            "Unable to determine ETH price.",
            "No WETH->USDC quote, no USDC->WETH fallback quote, and no env fallback available."
        ].join(" ");

        throw new Error(errorMessage);
    }

}