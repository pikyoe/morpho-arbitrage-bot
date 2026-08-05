import { ethers } from "ethers";
import { QuoteEngine } from "./QuoteEngine.js";
import { GasEstimator } from "../gas/GasEstimator.js";
import { OpportunityId } from "../utils/OpportunityId.js";
import { PriceOracle } from "../oracle/PriceOracle.js";
import { AdaptivePositionSearcher, DefaultPositionSearchConfig } from "./AdaptivePositionSearcher.js";
import { PositionPoint, PositionSizer } from "./PositionSizer.js";
import { ProfitCurve } from "./ProfitCurve.js";
import { ProfitPeakDetector } from "./ProfitPeakDetector.js";
import { QuoteResult } from "./quote/index.js";
import type { QuoteCache } from "./QuoteCache.js";
import { getQuoteCache } from "./QuoteCache.js";

export interface ArbitrageCandidate {
    id?: string;
    forward: QuoteResult;
    reverse: QuoteResult;
    amountIn: bigint;
    amountBack: bigint;
    profit: bigint;
    grossProfitUSD?: number;
    flashLoanFeeUSD?: number;
    gasCostUSD?: number;
    netProfitUSD?: number;
    profitable?: boolean;
}

export interface OptimizedScannerConfig {
    topNForwardQuotes?: number; // Only reverse quote top N forward results
    minLiquidityETH?: number; // Skip pools with liquidity below threshold
    enableQuoteCache?: boolean; // Enable quote result caching
    quoteCacheTTL?: number; // Quote cache TTL in milliseconds
    minPriceImpact?: number; // Minimum acceptable price impact fraction
    maxPriceImpact?: number; // Maximum acceptable price impact fraction
}

export class OptimizedMarketPairScanner {
    private readonly GAS_LIMIT = 650000n;
    private readonly FLASH_LOAN_FEE = 0.0005;
    private readonly SAFETY_BUFFER = 0.25;
    private quoteCache: QuoteCache;
    
    constructor(
        private readonly quoteEngine: QuoteEngine,
        private readonly priceOracle?: PriceOracle,
        private readonly config: OptimizedScannerConfig = {}
    ) {
        this.config.topNForwardQuotes = config.topNForwardQuotes ?? 3;
        this.config.minLiquidityETH = config.minLiquidityETH ?? 10;
        this.config.enableQuoteCache = config.enableQuoteCache ?? true;
        this.config.quoteCacheTTL = config.quoteCacheTTL ?? 3000;
        this.config.minPriceImpact = config.minPriceImpact ?? 0.01;
        this.config.maxPriceImpact = config.maxPriceImpact ?? 0.015;
        
        this.quoteCache = getQuoteCache(this.config.quoteCacheTTL);
    }

    public async scan(
        tokenA: string,
        tokenB: string,
        defaultAmount?: bigint
    ): Promise<ArbitrageCandidate[]> {
        const amounts = defaultAmount
            ? [defaultAmount]
            : AdaptivePositionSearcher.generate(DefaultPositionSearchConfig);

        const gasPrice = await this.priceOracle?.getGasPrice() ?? 0n;
        const ethPriceUSDValue = await this.priceOracle?.getEthPriceUSD() ?? 0;

        const bestCandidates: ArbitrageCandidate[] = [];
        const tested: PositionPoint[] = [];
        const curve = new ProfitCurve();

        for (const amountIn of amounts) {
            // OPTIMIZATION 1: Get all forward quotes ONCE per amount
            const forwardQuotes = await this.getForwardQuotesWithCache(
                tokenA,
                tokenB,
                amountIn
            );

            if (forwardQuotes.length === 0) {
                continue;
            }

            const minPriceImpact = this.config.minPriceImpact ?? 0.01;
            const maxPriceImpact = this.config.maxPriceImpact ?? 0.015;
            const filteredForwardQuotes = this.filterQuotesByPriceImpact(
                forwardQuotes,
                minPriceImpact,
                maxPriceImpact
            );

            if (filteredForwardQuotes.length === 0) {
                continue;
            }

            // OPTIMIZATION 2: Sort forward quotes by amountOut (best first)
            const sortedForwardQuotes = this.sortQuotesByAmountOut(filteredForwardQuotes);

            // OPTIMIZATION 3: Only take top N forward quotes
            const topForwardQuotes = sortedForwardQuotes.slice(0, this.config.topNForwardQuotes!);

            let bestForAmount: ArbitrageCandidate | null = null;

            // OPTIMIZATION 4: Only reverse quote for top N forward quotes
            for (const forward of topForwardQuotes) {
                const reverseQuotes = await this.getReverseQuotesWithCache(
                    tokenB,
                    tokenA,
                    forward.amountOut
                );

                const filteredReverseQuotes = this.filterQuotesByPriceImpact(
                    reverseQuotes,
                    minPriceImpact,
                    maxPriceImpact
                );

                for (const reverse of filteredReverseQuotes) {
                    // Arbitrage must be cross-DEX
                    if (forward.dex === reverse.dex) {
                        continue;
                    }

                    const amountBack = reverse.amountOut;

                    if (amountBack <= amountIn) {
                        continue;
                    }

                    const profit = amountBack - amountIn;

                    // Skip if gross profit < 0.01%
                    const minimumGrossProfit = amountIn / 10000n;
                    if (profit < minimumGrossProfit) {
                        continue;
                    }

                    const grossProfitETH = Number(
                        profit > 0n ? ethers.formatEther(profit) : 0
                    );

                    const grossProfitUSD = grossProfitETH * ethPriceUSDValue;

                    // Morpho fee
                    const flashLoanFeeUSD = Number(ethers.formatEther(amountIn)) *
                        ethPriceUSDValue *
                        this.FLASH_LOAN_FEE;

                    const gas = GasEstimator.estimate({
                        grossProfitUSD,
                        gasLimit: this.GAS_LIMIT,
                        gasPrice,
                        ethPriceUSD: ethPriceUSDValue,
                        flashLoanFeeUSD,
                        safetyBufferUSD: this.SAFETY_BUFFER
                    });

                    const candidate: ArbitrageCandidate = {
                        forward,
                        reverse,
                        amountIn,
                        amountBack,
                        profit,
                        grossProfitUSD,
                        flashLoanFeeUSD,
                        gasCostUSD: gas.gasCostUSD,
                        netProfitUSD: gas.netProfitUSD,
                        profitable: gas.profitable
                    };

                    candidate.id = OpportunityId.create(candidate);

                    if (!bestForAmount ||
                        (candidate.netProfitUSD ?? -Infinity) > (bestForAmount.netProfitUSD ?? -Infinity)) {
                        bestForAmount = candidate;
                    }
                }
            }

            if (bestForAmount) {
                bestCandidates.push(bestForAmount);
                tested.push({
                    amountIn: bestForAmount.amountIn,
                    netProfitUSD: bestForAmount.netProfitUSD ?? 0
                });

                curve.add(bestForAmount.amountIn, bestForAmount.netProfitUSD ?? 0);

                if (ProfitPeakDetector.reachedPeak(curve)) {
                    console.log();
                    console.log("Profit peak detected.");
                    break;
                }

                if (curve.isProfitDropping()) {
                    console.log("Profit started dropping.");
                    break;
                }
            }
        }

        if (bestCandidates.length === 0) {
            return [];
        }

        const positionResult = PositionSizer.choose(tested);
        const selectedAmount = positionResult.bestAmount;

        return bestCandidates.filter(
            candidate => candidate.amountIn === selectedAmount
        );
    }

    private async getForwardQuotesWithCache(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint
    ): Promise<QuoteResult[]> {
        if (this.config.enableQuoteCache) {
            // Try to get from cache first
            const cachedResults = this.quoteCache.getMultiple(tokenIn, tokenOut, amountIn, "UNISWAP");
            if (cachedResults.length > 0) {
                console.log(`Quote cache hit for ${tokenIn} -> ${tokenOut}`);
                return cachedResults;
            }
        }

        // Get fresh quotes
        const quotes = await this.quoteEngine.getAllQuotes({
            tokenIn,
            tokenOut,
            amountIn
        });

        // Cache the results
        if (this.config.enableQuoteCache) {
            for (const quote of quotes) {
                this.quoteCache.set(tokenIn, tokenOut, amountIn, quote.dex, quote, quote.pool);
            }
        }

        return quotes;
    }

    private async getReverseQuotesWithCache(
        tokenIn: string,
        tokenOut: string,
        amountIn: bigint
    ): Promise<QuoteResult[]> {
        if (this.config.enableQuoteCache) {
            // Try to get from cache first
            const cachedResults = this.quoteCache.getMultiple(tokenIn, tokenOut, amountIn, "UNISWAP");
            if (cachedResults.length > 0) {
                return cachedResults;
            }
        }

        // Get fresh quotes
        const quotes = await this.quoteEngine.getAllQuotes({
            tokenIn,
            tokenOut,
            amountIn
        });

        // Cache the results
        if (this.config.enableQuoteCache) {
            for (const quote of quotes) {
                this.quoteCache.set(tokenIn, tokenOut, amountIn, quote.dex, quote, quote.pool);
            }
        }

        return quotes;
    }

    private sortQuotesByAmountOut(quotes: QuoteResult[]): QuoteResult[] {
        return [...quotes].sort((a, b) => {
            if (a.amountOut > b.amountOut) return -1;
            if (a.amountOut < b.amountOut) return 1;
            return 0;
        });
    }

    // OPTIMIZATION 5: Skip low liquidity pools (would need liquidity data)
    // This would require integrating with pool state data
    private filterByLiquidity(quotes: QuoteResult[]): QuoteResult[] {
        // For now, this is a placeholder
        // In a full implementation, you would:
        // 1. Get pool state data
        // 2. Check liquidity against threshold
        // 3. Filter out low liquidity pools
        return quotes;
    }

    private filterQuotesByPriceImpact(
        quotes: QuoteResult[],
        minImpact: number,
        maxImpact: number
    ): QuoteResult[] {
        if (quotes.length === 0) {
            return [];
        }

        const bestPrice = Math.max(
            ...quotes.map(q => Number(q.amountOut) / Number(q.amountIn))
        );

        if (bestPrice <= 0) {
            return [];
        }

        return quotes.filter(q => {
            const price = Number(q.amountOut) / Number(q.amountIn);
            const impact = 1 - price / bestPrice;
            return impact >= minImpact && impact <= maxImpact;
        });
    }

    public getQuoteCacheStats() {
        return this.quoteCache.getStats();
    }

    public clearQuoteCache() {
        this.quoteCache.clear();
    }
}