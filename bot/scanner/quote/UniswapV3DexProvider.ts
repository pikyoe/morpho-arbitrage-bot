import { Contract, Provider, formatUnits, ZeroAddress } from "ethers";
import { PoolCache } from "../PoolCache.js";
import { QuoteRequest, QuoteResult } from "./index.js";
import { DexQuoteProvider } from "./DexQuoteProvider.js";
import { quoteRateLimiter } from "../../utils/RateLimiter.js";
import { UNISWAP_QUOTER_ABI } from "../abis/UniswapQuoter.js";
import { TOKEN_DECIMALS } from "../TokenList.js";

// Verbose logging flag from environment
const VERBOSE_LOGGING = process.env.VERBOSE_QUOTE_LOGGING === 'true';

/**
 * Uniswap V3-specific quote provider for arbitrage discovery
 * Returns quotes directly from Uniswap V3 pools
 */
export class UniswapV3DexProvider implements DexQuoteProvider {
    private provider: Provider;
    private cache: PoolCache;
    private quoter: Contract;
    private factory: Contract;
    private enabled: boolean = true;

    constructor(
        provider: Provider,
        cache: PoolCache,
        quoterAddress: string,
        factoryAddress: string
    ) {
        this.provider = provider;
        this.cache = cache;
        this.quoter = new Contract(quoterAddress, UNISWAP_QUOTER_ABI, provider);
        this.factory = new Contract(factoryAddress, ["function getPool(address,address,uint24) view returns (address)"], provider);
    }

    /**
     * Get a quote from Uniswap V3 DEX
     * Returns the best quote from all Uniswap V3 pools for the token pair
     */
    async quote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (!this.enabled) {
            return null;
        }

        try {
            if (VERBOSE_LOGGING) {
                console.log(`  UniswapV3: Using cached pools for ${request.tokenIn.slice(0,6)}→${request.tokenOut.slice(0,6)}`);
            }

            const cachedPools = this.cache.findPair(request.tokenIn, request.tokenOut)
                .filter(pool => pool.dex.toLowerCase() === "uniswap" && pool.fee != null);
            let feeTiers = [...new Set(cachedPools.map(pool => Number(pool.fee)))];
            // The subgraph may not include an anchor pair such as WETH/USDC.
            // Fall back to factory discovery only for this cache miss.
            if (feeTiers.length === 0) feeTiers = [100, 500, 3000, 10000];
            let bestQuote: QuoteResult | null = null;
            let bestAmountOut = 0n;

            for (const fee of feeTiers) {
                try {
                    await quoteRateLimiter.wait();
                    let poolAddress = cachedPools.find(pool => Number(pool.fee) === fee)?.pool ?? ZeroAddress;
                    if (poolAddress === ZeroAddress) {
                        poolAddress = await this.factory.getPool(request.tokenIn, request.tokenOut, fee);
                        if (poolAddress === ZeroAddress) continue;
                    }

                    // Pool exists and has liquidity - quote it
                    if (VERBOSE_LOGGING) {
                        console.log(`  UniswapV3: testing pool=${poolAddress.slice(0,8)}... fee=${fee}`);
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
                            console.log(`  UniswapV3: INVALID QUOTE → amountOut=0 fee=${fee}`);
                        }
                        continue;
                    }

                    if (VERBOSE_LOGGING) {
                        console.log(`  UniswapV3: SUCCESS → ${amountOut.toString()}`);
                        
                        // Calculate effective price
                        const tokenInDecimals = TOKEN_DECIMALS[request.tokenIn.toLowerCase()] || 18;
                        const tokenOutDecimals = TOKEN_DECIMALS[request.tokenOut.toLowerCase()] || 18;
                        const amountInHuman = Number(formatUnits(request.amountIn, tokenInDecimals));
                        const amountOutHuman = Number(formatUnits(amountOut, tokenOutDecimals));
                        const effectivePrice = amountOutHuman / amountInHuman;
                        console.log(`  UniswapV3: Effective price: ${effectivePrice.toFixed(6)} OUT/IN`);
                    }

                    if (amountOut > bestAmountOut) {
                        bestAmountOut = amountOut;
                        bestQuote = {
                            dex: "UNISWAP",
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
                    console.log(`  UniswapV3: BEST pool=${bestQuote.pool.slice(0,8)}... fee=${bestQuote.fee} amountOut=${bestQuote.amountOut.toString()}`);
                } else {
                    console.log(`  UniswapV3: No valid quotes obtained`);
                }
            }
            return bestQuote;
        } catch (error) {
            if (VERBOSE_LOGGING) {
                console.error(`  UniswapV3: Error`, error);
            }
            return null;
        }
    }

    getDexName(): string {
        return "UniswapV3";
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
