import { Contract, Provider, formatUnits, ZeroAddress } from "ethers";
import { PoolCache } from "../PoolCache.js";
import { QuoteRequest, QuoteResult } from "./index.js";
import { DexQuoteProvider } from "./DexQuoteProvider.js";
import { quoteRateLimiter } from "../../utils/RateLimiter.js";
import { PANCAKESWAP_QUOTER_ABI } from "../abis/PancakeSwapQuoter.js";
import { TOKEN_DECIMALS } from "../TokenList.js";

// Verbose logging flag from environment
const VERBOSE_LOGGING = process.env.VERBOSE_QUOTE_LOGGING === 'true';

/**
 * PancakeSwap V3-specific quote provider for arbitrage discovery
 * Returns quotes directly from PancakeSwap V3 pools
 * PancakeSwap V3 uses the same quoter interface as Uniswap V3
 */
export class PancakeSwapDexProvider implements DexQuoteProvider {
    private provider: Provider;
    private cache: PoolCache;
    private quoter: Contract;
    private enabled: boolean = true;

    constructor(
        provider: Provider,
        cache: PoolCache,
        quoterAddress: string,
        _factoryAddress: string
    ) {
        this.provider = provider;
        this.cache = cache;
        this.quoter = new Contract(quoterAddress, PANCAKESWAP_QUOTER_ABI, provider);
    }

    /**
     * Get a quote from PancakeSwap V3 DEX
     * Returns the best quote from all PancakeSwap V3 pools for the token pair
     */
    async quote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (!this.enabled) {
            return null;
        }

        try {
            if (VERBOSE_LOGGING) {
                console.log(`  PancakeSwap: Using cached pools for ${request.tokenIn.slice(0,6)}→${request.tokenOut.slice(0,6)}`);
            }

            // Pool discovery is performed by the subgraph/RPC loader. Do not call
            // the factory for every quote: that multiplies RPC calls and triggers
            // provider rate limits. Only quote fee tiers already in PoolCache.
            const cachedPools = this.cache.findPair(request.tokenIn, request.tokenOut)
                .filter(pool => pool.dex.toLowerCase() === "pancakeswap" && pool.fee != null);
            const feeTiers = [...new Set(cachedPools.map(pool => Number(pool.fee)))];
            if (feeTiers.length === 0) return null;
            let bestQuote: QuoteResult | null = null;
            let bestAmountOut = 0n;

            for (const fee of feeTiers) {
                try {
                    await quoteRateLimiter.wait();
                    const poolAddress = cachedPools.find(pool => Number(pool.fee) === fee)?.pool ?? ZeroAddress;

                    // Pool exists and has liquidity - quote it
                    if (VERBOSE_LOGGING) {
                        console.log(`  PancakeSwap: testing pool=${poolAddress.slice(0,8)}... fee=${fee}`);
                    }

                    const quote = await this.quoter.quoteExactInputSingle.staticCall(
                        {
                            tokenIn: request.tokenIn,
                            tokenOut: request.tokenOut,
                            fee: fee,
                            amountIn: request.amountIn,
                            sqrtPriceLimitX96: 0
                        }
                    );

                    // Extract amountOut from tuple (QuoterV2 returns 4 values)
                    const amountOut = Array.isArray(quote) ? quote[0] : quote;

                    // Validate quote - reject zero outputs
                    if (amountOut === 0n) {
                        if (VERBOSE_LOGGING) {
                            console.log(`  PancakeSwap: INVALID QUOTE → amountOut=0 fee=${fee}`);
                        }
                        continue;
                    }

                    if (VERBOSE_LOGGING) {
                        console.log(`  PancakeSwap: SUCCESS → ${amountOut.toString()}`);
                        
                        // Calculate effective price
                        const tokenInDecimals = TOKEN_DECIMALS[request.tokenIn.toLowerCase()] || 18;
                        const tokenOutDecimals = TOKEN_DECIMALS[request.tokenOut.toLowerCase()] || 18;
                        const amountInHuman = Number(formatUnits(request.amountIn, tokenInDecimals));
                        const amountOutHuman = Number(formatUnits(amountOut, tokenOutDecimals));
                        const effectivePrice = amountOutHuman / amountInHuman;
                        console.log(`  PancakeSwap: Effective price: ${effectivePrice.toFixed(6)} OUT/IN`);
                    }

                    if (amountOut > bestAmountOut) {
                        bestAmountOut = amountOut;
                        bestQuote = {
                            dex: "PANCAKESWAP",
                            pool: poolAddress,
                            tokenIn: request.tokenIn,
                            tokenOut: request.tokenOut,
                            amountIn: request.amountIn,
                            amountOut,
                            fee: fee
                        };
                    }
                } catch (error) {
                    // Skip this fee tier if pool check or quote fails
                    continue;
                }
            }

            if (VERBOSE_LOGGING) {
                if (bestQuote) {
                    console.log(`  PancakeSwap: BEST pool=${bestQuote.pool.slice(0,8)}... fee=${bestQuote.fee} amountOut=${bestQuote.amountOut.toString()}`);
                } else {
                    console.log(`  PancakeSwap: No valid quotes obtained`);
                }
            }
            return bestQuote;
        } catch (error) {
            if (VERBOSE_LOGGING) {
                console.error(`  PancakeSwap: Error`, error);
            }
            return null;
        }
    }

    getDexName(): string {
        return "PancakeSwap";
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }
}
