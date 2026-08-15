import { Contract, Provider, ZeroAddress, formatUnits } from "ethers";
import { PoolCache } from "../PoolCache.js";
import { QuoteRequest, QuoteResult } from "./index.js";
import { DexQuoteProvider } from "./DexQuoteProvider.js";
import { quoteRateLimiter } from "../../utils/RateLimiter.js";
import { SUSHISWAP_QUOTER_ABI } from "../abis/SushiSwapQuoter.js";
import { TOKEN_DECIMALS } from "../TokenList.js";

// Verbose logging flag from environment
const VERBOSE_LOGGING = process.env.VERBOSE_QUOTE_LOGGING === 'true';

/**
 * SushiSwap-specific quote provider for arbitrage discovery
 * Returns quotes directly from SushiSwap DEX pools
 */
export class SushiSwapDexProvider implements DexQuoteProvider {
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
        this.quoter = new Contract(quoterAddress, SUSHISWAP_QUOTER_ABI, provider);
    }

    /**
     * Get a quote from SushiSwap DEX
     * Returns the best quote from all SushiSwap pools for the token pair
     */
    async quote(request: QuoteRequest): Promise<QuoteResult | null> {
        if (!this.enabled) {
            return null;
        }

        try {
            if (VERBOSE_LOGGING) {
                console.log(`\n=== SushiSwap Quote Request (cached pools) ===`);
                console.log(`  tokenIn: ${request.tokenIn.slice(0,6)}...`);
                console.log(`  tokenOut: ${request.tokenOut.slice(0,6)}...`);
                console.log(`  amountIn: ${request.amountIn.toString()}`);
                console.log(`  SushiSwap: Using cached pools (no factory RPC lookup)`);
            }

            const cachedPools = this.cache.findPair(request.tokenIn, request.tokenOut)
                .filter(pool => pool.dex.toLowerCase() === "sushiswap" && pool.fee != null);
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
                        console.log(`  Attempting quote for pool: ${poolAddress.slice(0,8)}... (fee: ${fee})`);
                    }

                    // Debug: Check pool state for problematic pair
                    if (request.tokenIn.toLowerCase() === "0x0b3e".toLowerCase() && 
                        request.tokenOut.toLowerCase() === "0x4200".toLowerCase() ||
                        request.tokenIn.toLowerCase() === "0x4200".toLowerCase() && 
                        request.tokenOut.toLowerCase() === "0x0b3e".toLowerCase()) {
                        
                        try {
                            const pool = new Contract(
                                poolAddress,
                                ["function token0() external view returns (address)", 
                                 "function token1() external view returns (address)",
                                 "function liquidity() external view returns (uint128)",
                                 "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"],
                                this.provider
                            );
                            
                            const [token0, token1, poolLiquidity, slot0Data] = await Promise.all([
                                pool.token0(),
                                pool.token1(),
                                pool.liquidity(),
                                pool.slot0()
                            ]);
                            
                            console.log(`  SUSHI POOL STATE:`, {
                                pool: poolAddress.slice(0,8),
                                token0,
                                token1,
                                liquidity: poolLiquidity.toString(),
                                sqrtPriceX96: slot0Data.sqrtPriceX96.toString(),
                                tick: slot0Data.tick.toString()
                            });
                        } catch (error) {
                            if (VERBOSE_LOGGING) {
                                console.log(`  SUSHI POOL STATE ERROR: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                    }

                    // Debug: Print raw quote parameters
                    if (VERBOSE_LOGGING) {
                        console.log(`  SUSHI QUOTE REQUEST:`, {
                            pool: poolAddress,
                            tokenIn: request.tokenIn,
                            tokenOut: request.tokenOut,
                            fee: fee,
                            amountIn: request.amountIn.toString(),
                            quoterAddress: this.quoter.target
                        });
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
                            console.log(`  SushiSwap: INVALID QUOTE → amountOut=0 fee=${fee}`);
                        }
                        continue;
                    }

                    if (VERBOSE_LOGGING) {
                        console.log(`  SushiSwap: SUCCESS → ${amountOut.toString()}`);
                        
                        // Calculate effective price for consistency with UniswapV3
                        const tokenInDecimals = TOKEN_DECIMALS[request.tokenIn.toLowerCase()] || 18;
                        const tokenOutDecimals = TOKEN_DECIMALS[request.tokenOut.toLowerCase()] || 18;
                        const amountInHuman = Number(formatUnits(request.amountIn, tokenInDecimals));
                        const amountOutHuman = Number(formatUnits(amountOut, tokenOutDecimals));
                        const effectivePrice = amountOutHuman / amountInHuman;
                        console.log(`  SushiSwap: Effective price: ${effectivePrice.toFixed(6)} OUT/IN`);
                    }

                    if (amountOut > bestAmountOut) {
                        bestAmountOut = amountOut;
                        bestQuote = {
                            dex: "SUSHISWAP",
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
                    console.log(`  SushiSwap: Best quote ${bestQuote.amountOut.toString()} (fee: ${bestQuote.fee})`);
                } else {
                    console.log(`  SushiSwap: No valid quotes obtained`);
                }
            }
            return bestQuote;
        } catch (error) {
            if (VERBOSE_LOGGING) {
                console.error(`  SushiSwap: Error`, error);
            }
            return null;
        }
    }

    getDexName(): string {
        return "SushiSwap";
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
