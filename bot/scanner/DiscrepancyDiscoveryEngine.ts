import { DexQuoteProvider } from "./quote/DexQuoteProvider.js";
import { QuoteResult } from "./quote/index.js";
import { PoolCache } from "./PoolCache.js";
import { Contract, formatUnits, parseUnits, Provider } from "ethers";
import { TOKEN_DECIMALS } from "./TokenList.js";

// Verbose logging flag from environment
const VERBOSE_LOGGING = process.env.VERBOSE_QUOTE_LOGGING === 'true';

// Edge representing an executable swap route
export interface ArbitrageEdge {
    tokenIn: string;
    tokenOut: string;
    tokenInDecimals: number;
    tokenOutDecimals: number;
    amountIn: bigint;
    amountOut: bigint;
    normalizedPrice: number; // Price in human-readable format
    dex: string;
    pool: string;
    fee: number;
    stable?: boolean;
    factory?: string;
    dexProvider: DexQuoteProvider;
}

export interface QuoteEdge {
    dex: string;
    tokenIn: string;
    tokenOut: string;
    pool: string;
    fee: number;
    stable?: boolean;
    factory?: string;
    amountIn: bigint;
    amountOut: bigint;
    dexProvider: DexQuoteProvider;
}

export interface DiscrepancyOpportunity {
    tokenA: string;
    tokenB: string;
    dexA: string;
    dexB: string;
    quoteA: QuoteEdge;
    quoteB: QuoteEdge;
    spreadPercentage: number;
    liquidityA: number;
    liquidityB: number;
}

export interface TriangleCandidate {
    tokenA: string;
    tokenB: string;
    tokenC: string;
    legs: {
        from: string;
        to: string;
        amountIn: bigint;
        amountOut: bigint;
        normalizedPrice: number;
        dex: string;
        fee: number;
        stable?: boolean;
        factory?: string;
        dexProvider: DexQuoteProvider;
    }[];
    inputAmount: bigint;
    outputAmount: bigint;
    rawProfit: bigint;
    rawProfitPercentage: number;
    routeName: string;
    qualityMetrics: {
        dexVariety: number;
        minLiquidity: number;
        maxInputLiquidityRatio: number;
    };
}

// Runtime leg data for tracking actual amounts during DFS
interface RuntimeLeg {
    edge: ArbitrageEdge;
    amountIn: bigint;
    amountOut: bigint;
}

/**
 * Two-phase discovery engine:
 * Phase A: Find price discrepancies between DEXes for each token pair
 * Phase B: Form triangles from high-discrepancy pairs
 */
export class DiscrepancyDiscoveryEngine {
    private dexProviders: DexQuoteProvider[];
    private poolCache: PoolCache;
    private minSpreadPercentage: number;
    private readonly tokenPriceCache = new Map<string, { price: number; expiresAt: number }>();
    private readonly tokenDecimalsCache = new Map<string, number>();
    private readonly provider?: Provider;
    private bidirectionalPrices: Map<string, Map<string, number>> = new Map();

    constructor(
        dexProviders: DexQuoteProvider[],
        poolCache: PoolCache,
        minSpreadPercentage: number = 0.003, // 0.3% minimum spread
        provider?: Provider
    ) {
        this.dexProviders = dexProviders.filter(p => p.isEnabled());
        this.poolCache = poolCache;
        this.minSpreadPercentage = minSpreadPercentage;
        this.provider = provider;

        console.log("\n=== DiscrepancyDiscoveryEngine DEX Providers ===");
        for (const provider of this.dexProviders) {
            console.log(`  ${provider.getDexName()}`);
        }

        console.log("\n=== Discrepancy Discovery Filters ===");
        console.log(`  Minimum spread: ${(this.minSpreadPercentage * 100).toFixed(2)}%`);
    }

    private async getTokenDecimals(tokenAddress: string, fallback = 18): Promise<number> {
        const lower = tokenAddress.toLowerCase();
        const known = TOKEN_DECIMALS[lower];
        if (known !== undefined) return known;
        const cached = this.tokenDecimalsCache.get(lower);
        if (cached !== undefined) return cached;
        if (!this.provider) return fallback;
        try {
            const token = new Contract(tokenAddress, ["function decimals() view returns (uint8)"], this.provider);
            const decimals = Number(await token.decimals());
            if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return fallback;
            this.tokenDecimalsCache.set(lower, decimals);
            return decimals;
        } catch {
            return fallback;
        }
    }

    /**
     * Adjust USD-based amount to token-specific amount
     * ALL tokens should use USD-equivalent amount for fair comparison
     * 
     * @param usdAmount USD amount in USDC (6 decimals)
     * @param tokenDecimals Target token decimals
     * @param tokenAddress Target token address
     * @returns Token amount in target token decimals
     */
    private async adjustAmountForToken(usdAmount: bigint, tokenDecimals: number, tokenAddress: string): Promise<bigint> {
        const usdDecimals = 6; // USDC uses 6 decimals
        const usdValue = Number(formatUnits(usdAmount, usdDecimals)); // e.g., 100.0 USD
        
        // Token price estimates in USD (fallback prices for discovery)
        // In production, these should come from PriceOracle
        const tokenPricesUSD: Record<string, number> = {
            // Stablecoins = $1 USD
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": 1.0,   // USDC
            "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": 1.0,   // USDT
            "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": 1.0,   // DAI
            "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42": 1.0,   // EURC (approx $1)
            "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": 1.0,   // USDe (synthetic $1)
            "0x8d58c0c60b8d6b88fa98b291a646db34d0f98258": 1.0,   // RLUSD
            
            // Major tokens (estimated prices)
            "0x4200000000000000000000000000000000000006": 1900.0, // WETH (~$1,900)
            "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": 95000.0, // CBBTC (~$95,000)
            "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22": 2800.0, // CBETH (~$2,800)
            "0x940181a94a35a4569e4529a3cdfb74e38fd98631": 2.5,    // AERO (~$2.5)
            "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b": 1.5,    // VIRTUAL (~$1.5)
            "0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842": 1.2,    // MORPHO_TOKEN (~$1.2)
            "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452": 3200.0, // wstETH (~$3,200)
            "0x5875eee11cf8398102fdad704c9e96607675467a": 1.05,   // sUSDS (~$1.05)
            "0x6985884c4392d348587b19cb9eaaf157f13271cd": 4.0,    // ZRO (~$4)
            "0x1111111111166b7fe7bd91427724b487980afc69": 0.15,   // ZORA (~$0.15)
            "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": 18.0,   // LINK (~$18)
            "0x8ee73c484a26e0a5df2ee2a4960b789967dd0415": 0.35,   // CRV (~$0.35)
            "0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e": 3.5,    // PENDLE (~$3.5)
            "0x98d0baa52b2d063e780de12f615f963fe8537553": 0.5,    // KAITO (~$0.5)
            "0x4ed4e862860bed51a9570b96d89af5e1b0efefed": 0.08,   // DEGEN (~$0.08)
        };
        
        const lower = tokenAddress.toLowerCase();
        const stableTokens = new Set([
            "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
            "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
            "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
            "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
            "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34",
            "0x8d58c0c60b8d6b88fa98b291a646db34d0f98258"
        ]);
        let tokenPriceUSD = stableTokens.has(lower) ? 1 : 0;
        const cached = this.tokenPriceCache.get(lower);
        if (cached && cached.expiresAt > Date.now()) tokenPriceUSD = cached.price;
        if (tokenPriceUSD <= 0) {
            try {
                const oneToken = parseUnits("1", tokenDecimals);
                const quotes = await Promise.all(this.dexProviders.map(provider =>
                    provider.quote({ tokenIn: tokenAddress, tokenOut: "0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913", amountIn: oneToken })
                ));
                const valid = quotes.filter((q): q is QuoteResult => q !== null && q.amountOut > 0n);
                if (valid.length > 0) {
                    const best = valid.reduce((a, b) => a.amountOut > b.amountOut ? a : b);
                    tokenPriceUSD = Number(formatUnits(best.amountOut, 6));
                    this.tokenPriceCache.set(lower, { price: tokenPriceUSD, expiresAt: Date.now() + 30_000 });
                }
            } catch { /* use conservative fallback below */ }
        }

        // Many Base tokens do not have a direct USDC pool but do have a
        // liquid WETH route. Price them through token -> WETH -> USDC before
        // rejecting the token as unpriced.
        if (tokenPriceUSD <= 0 && lower !== "0x4200000000000000000000000000000000000006") {
            const weth = "0x4200000000000000000000000000000000000006";
            const usdc = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
            for (const provider of this.dexProviders) {
                try {
                    const toWeth = await provider.quote({ tokenIn: tokenAddress, tokenOut: weth, amountIn: parseUnits("1", tokenDecimals) });
                    if (!toWeth || toWeth.amountOut <= 0n) continue;
                    const toUsdc = await provider.quote({ tokenIn: weth, tokenOut: usdc, amountIn: toWeth.amountOut });
                    if (!toUsdc || toUsdc.amountOut <= 0n) continue;
                    tokenPriceUSD = Number(formatUnits(toUsdc.amountOut, 6));
                    this.tokenPriceCache.set(lower, { price: tokenPriceUSD, expiresAt: Date.now() + 30_000 });
                    break;
                } catch {
                    continue;
                }
            }
        }
        if (tokenPriceUSD <= 0) {
            // Never assume an unknown token is worth $1. That creates wildly
            // incorrect test sizes and artificial percentage profits.
            if (VERBOSE_LOGGING) {
                console.log(`  Skipping ${tokenAddress.slice(0, 10)}: no USD price available`);
            }
            return 0n;
        }
        
        // Calculate token amount: USD value / token price
        const tokenAmount = usdValue / tokenPriceUSD;
        
        // Convert to token decimals
        return parseUnits(tokenAmount.toFixed(6), tokenDecimals);
    }

    /**
     * Phase A: Collect all executable bidirectional edges from DEXes
     * This builds a complete graph of all possible swap routes
     * 
     * @param tokenPairs Token pairs to check
     * @param testAmounts Array of USD amounts to test (in USDC 6 decimals)
     */
    public async collectExecutableEdges(
        tokenPairs: { tokenA: string; tokenB: string }[],
        testAmounts: bigint[] = [parseUnits("500", 6)] // Default: 500 USDC only
    ): Promise<{ edges: ArbitrageEdge[], discrepancies: DiscrepancyOpportunity[] }> {
        console.log("\n=== Phase A: Collecting Executable Edges ===");
        console.log(`Token pairs to check: ${tokenPairs.length}`);
        console.log(`Test amounts: ${testAmounts.length} amount(s): [${testAmounts.map(a => formatUnits(a, 6)).join(', ')}] USDC`);

        const edges: ArbitrageEdge[] = [];
        const discrepancies: DiscrepancyOpportunity[] = [];

        for (const { tokenA, tokenB } of tokenPairs) {
            if (VERBOSE_LOGGING) {
                console.log(`\nChecking pair: ${tokenA.slice(0,6)} ↔ ${tokenB.slice(0,6)}`);
            }

            // Get token-specific decimals
            const decimalsA = await this.getTokenDecimals(tokenA);
            const decimalsB = await this.getTokenDecimals(tokenB);
            
            // Test each USD amount and collect best quotes
            for (const testAmount of testAmounts) {
                const usdValue = Number(formatUnits(testAmount, 6));
                if (VERBOSE_LOGGING) {
                    console.log(`  Testing USD amount: $${usdValue}`);
                }
                
                // Convert USD-based testAmount to token-specific amounts
                const amountInA = await this.adjustAmountForToken(testAmount, decimalsA, tokenA);
                const amountInB = await this.adjustAmountForToken(testAmount, decimalsB, tokenB);
                if (amountInA <= 0n || amountInB <= 0n) {
                    if (VERBOSE_LOGGING) {
                        console.log(`  Skipping pair: missing reliable USD price for one token`);
                    }
                    continue;
                }
            
                const directions = [
                    { from: tokenA, to: tokenB, amountIn: amountInA },
                    { from: tokenB, to: tokenA, amountIn: amountInB }
                ];

                for (const { from, to, amountIn } of directions) {
                    if (VERBOSE_LOGGING) {
                        console.log(`  Testing direction: ${from.slice(0,6)} → ${to.slice(0,6)} (amount: ${amountIn.toString()})`);
                    }

                    // Get decimals for normalization
                    const decimalsIn = TOKEN_DECIMALS[from.toLowerCase()] || 18;
                    const decimalsOut = TOKEN_DECIMALS[to.toLowerCase()] || 18;

                    // Collect quotes from each DEX for this direction
                    const quotesByDex: Map<string, QuoteEdge> = new Map();
                    const forwardPricesByDex: Map<string, number> = new Map();

                    for (const provider of this.dexProviders) {
                        try {
                            const quote = await provider.quote({
                                tokenIn: from,
                                tokenOut: to,
                                amountIn
                            });

                            if (quote) {
                                // Calculate normalized price for accurate comparison
                                const normalizedPrice = Number(formatUnits(quote.amountOut, decimalsOut)) / 
                                                      Number(formatUnits(quote.amountIn, decimalsIn));

                                // Reject zero or invalid prices
                                if (normalizedPrice === 0 || !isFinite(normalizedPrice)) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ${provider.getDexName()}: Invalid price ${normalizedPrice}, skipping`);
                                    }
                                    continue;
                                }

                                // Reject extremely small prices (likely zero/empty pool)
                                if (normalizedPrice < 1e-18) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ${provider.getDexName()}: Price too small ${normalizedPrice.toExponential(2)}, skipping`);
                                    }
                                    continue;
                                }

                                // Additional sanity check for unreasonable prices
                                // Prices should be within reasonable bounds (e.g., 1e-12 to 1e12)
                                if (normalizedPrice < 1e-12 || normalizedPrice > 1e12) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ${provider.getDexName()}: Unreasonable price ${normalizedPrice.toFixed(2)}, skipping`);
                                    }
                                    continue;
                                }

                                // Debug logging for price sanity
                                if (VERBOSE_LOGGING) {
                                    console.log(`    ${provider.getDexName()} DEBUG:`, {
                                        pool: quote.pool.slice(0,8),
                                        fee: quote.fee,
                                        amountInRaw: quote.amountIn.toString(),
                                        amountInDecimals: decimalsIn,
                                        amountInHuman: Number(formatUnits(quote.amountIn, decimalsIn)).toFixed(6),
                                        amountOutRaw: quote.amountOut.toString(),
                                        amountOutDecimals: decimalsOut,
                                        amountOutHuman: Number(formatUnits(quote.amountOut, decimalsOut)).toFixed(6),
                                        normalizedPrice: normalizedPrice.toFixed(6)
                                    });
                                }

                                const edge: ArbitrageEdge = {
                                    tokenIn: from,
                                    tokenOut: to,
                                    tokenInDecimals: decimalsIn,
                                    tokenOutDecimals: decimalsOut,
                                    amountIn: quote.amountIn,
                                    amountOut: quote.amountOut,
                                    normalizedPrice,
                                    dex: provider.getDexName(),
                                    pool: quote.pool,
                                    fee: quote.fee ?? 0,
                                    stable: quote.stable,
                                    factory: quote.factory,
                                    dexProvider: provider
                                };
                                
                                edges.push(edge);
                                quotesByDex.set(provider.getDexName(), {
                                    dex: provider.getDexName(),
                                    tokenIn: quote.tokenIn,
                                    tokenOut: quote.tokenOut,
                                    pool: quote.pool,
                                    fee: quote.fee ?? 0,
                                    stable: quote.stable,
                                    factory: quote.factory,
                                    amountIn: quote.amountIn,
                                    amountOut: quote.amountOut,
                                    dexProvider: provider
                                });

                                forwardPricesByDex.set(provider.getDexName(), normalizedPrice);
                            }
                        } catch (error) {
                            console.log(`  ${provider.getDexName()}: Error - ${error instanceof Error ? error.message : String(error)}`);
                        }
                    }

                    // Store forward prices for later bidirectional sanity check (DISABLED TEMPORARILY)
                    const directionKey = `${from}-${to}`;
                    const reverseDirectionKey = `${to}-${from}`;
                    
                    // Store current direction prices
                    this.bidirectionalPrices.set(directionKey, forwardPricesByDex);
                    
                    // Check if we have the reverse direction already (for bidirectional sanity check) - DISABLED TEMPORARILY
                    // const reversePrices = this.bidirectionalPrices.get(reverseDirectionKey);
                    // if (reversePrices) {
                    //     for (const [dex, reversePrice] of reversePrices.entries()) {
                    //         const forwardPrice = forwardPricesByDex.get(dex);
                    //         if (forwardPrice !== undefined) {
                    //             const product = forwardPrice * reversePrice;
                    //             
                    //             // Re-enabled bidirectional sanity check with lenient tolerance (0.01-100.0) for Base network
                    //             if (product < 0.01 || product > 100.0) {
                    //                 console.warn(`⚠️ INVALID bidirectional price: ${dex} ${from.slice(0,6)}↔${to.slice(0,6)}`);
                    //                 console.warn(`   Forward (${from.slice(0,6)}→${to.slice(0,6)}): ${forwardPrice.toFixed(6)}, Reverse (${to.slice(0,6)}→${from.slice(0,6)}): ${reversePrice.toFixed(6)}, Product: ${product.toFixed(6)}`);
                    //                 
                    //                 // Remove the inconsistent quotes from consideration
                    //                 quotesByDex.delete(dex);
                    //                 forwardPricesByDex.delete(dex);
                    //                 
                    //                 // Also remove from reverse direction
                    //                 reversePrices.delete(dex);
                    //             }
                    //         }
                    //     }
                    // }

                    // Find discrepancies using normalized prices
                    const dexNames = Array.from(quotesByDex.keys());
                    for (let i = 0; i < dexNames.length; i++) {
                        for (let j = i + 1; j < dexNames.length; j++) {
                            const dexA = dexNames[i];
                            const dexB = dexNames[j];
                            const quoteA = quotesByDex.get(dexA)!;
                            const quoteB = quotesByDex.get(dexB)!;

                            // Use the already calculated normalized prices from forwardPricesByDex
                            const priceA = forwardPricesByDex.get(dexA)!;
                            const priceB = forwardPricesByDex.get(dexB)!;
                            
                            // Use absolute spread so discrepancies are caught regardless of
                            // which DEX (A or B) happens to be priced higher. The previous
                            // signed version only caught the case priceB > priceA and silently
                            // missed roughly half of all real discrepancies.
                            const spreadPercentage = Math.abs(priceB - priceA) / Math.min(priceA, priceB);

                            // Additional sanity check: prices should be reasonable
                            if (priceA < 1e-12 || priceA > 1e12 || priceB < 1e-12 || priceB > 1e12) {
                                if (VERBOSE_LOGGING) {
                                    console.log(`  ⚠️ Skipping unreasonable price comparison: ${dexA}=${priceA.toFixed(2)} vs ${dexB}=${priceB.toFixed(2)}`);
                                }
                                continue;
                            }

                            // Sanity check: prices should be in similar order of magnitude
                            const priceRatio = Math.max(priceA, priceB) / Math.min(priceA, priceB);
                            if (priceRatio > 1000) {
                                if (VERBOSE_LOGGING) {
                                    console.log(`  ⚠️ Skipping extreme price ratio: ${dexA}=${priceA.toFixed(2)} vs ${dexB}=${priceB.toFixed(2)} (ratio: ${priceRatio.toFixed(1)}x)`);
                                }
                                continue;
                            }

                            // Filter out extreme spreads that indicate bad quotes (> 1000% spread) - DISABLED
                            // if (Math.abs(spreadPercentage) > 10) {
                            //     console.log(`  ⚠️ Skipping extreme spread: ${(spreadPercentage * 100).toFixed(2)}% (likely bad quote)`);
                            //     continue;
                            // }

                            if (spreadPercentage >= this.minSpreadPercentage) {
                                const poolA = this.poolCache.getAll().find(p => p.pool === quoteA.pool);
                                const poolB = this.poolCache.getAll().find(p => p.pool === quoteB.pool);

                                const liquidityA = Math.max(poolA?.reserveUSD ?? 0, poolA?.totalValueLockedUSD ?? 0);
                                const liquidityB = Math.max(poolB?.reserveUSD ?? 0, poolB?.totalValueLockedUSD ?? 0);

                                // Minimum liquidity filter for discrepancy discovery - OPTION C
                                const MIN_LIQUIDITY_USD = 1000; // $1,000 minimum
                                if (liquidityA < MIN_LIQUIDITY_USD || liquidityB < MIN_LIQUIDITY_USD) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ⚠️ Skipping low liquidity discrepancy: ${dexA}=$${liquidityA.toLocaleString()}, ${dexB}=$${liquidityB.toLocaleString()}`);
                                    }
                                    continue;
                                }

                                // Liquidity balance filter: reject if one DEX has > 100x more liquidity
                                const liquidityRatio = Math.max(liquidityA, liquidityB) / Math.min(liquidityA, liquidityB);
                                if (liquidityRatio > 100) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ⚠️ Skipping liquidity imbalance: ${dexA}=$${liquidityA.toLocaleString()}, ${dexB}=$${liquidityB.toLocaleString()} (ratio: ${liquidityRatio.toFixed(1)}x)`);
                                    }
                                    continue;
                                }

                                // Filter out extreme spreads that indicate bad quotes (> 100% spread)
                                if (Math.abs(spreadPercentage) > 1) {
                                    if (VERBOSE_LOGGING) {
                                        console.log(`  ⚠️ Skipping extreme spread: ${(spreadPercentage * 100).toFixed(2)}% (likely bad quote)`);
                                    }
                                    continue;
                                }

                                // DEBUG: Log discrepancy details
                                console.log(`  ✓ DISCREPANCY FOUND: ${from.slice(0,6)}→${to.slice(0,6)}`);
                                console.log(`    ${dexA}: ${priceA.toFixed(6)} (pool: ${quoteA.pool.slice(0,8)}, liquidity: $${liquidityA.toLocaleString()})`);
                                console.log(`    ${dexB}: ${priceB.toFixed(6)} (pool: ${quoteB.pool.slice(0,8)}, liquidity: $${liquidityB.toLocaleString()})`);
                                console.log(`    Spread: ${(spreadPercentage * 100).toFixed(2)}%`);

                                discrepancies.push({
                                    tokenA: from,
                                    tokenB: to,
                                    dexA,
                                    dexB,
                                    quoteA,
                                    quoteB,
                                    spreadPercentage,
                                    liquidityA,
                                    liquidityB
                                });

                                console.log(`  ✅ Discrepancy found: ${dexA} vs ${dexB}`);
                                console.log(`     Spread: ${(spreadPercentage * 100).toFixed(4)}%`);
                                console.log(`     ${dexA}: price=${priceA.toFixed(6)} pool: ${quoteA.pool.slice(0,8)}...`);
                                console.log(`     ${dexB}: price=${priceB.toFixed(6)} pool: ${quoteB.pool.slice(0,8)}...`);
                            }
                        }
                    }
                } // End of directions loop
            } // End of testAmounts loop
        } // End of tokenPairs loop

        console.log(`\n=== Phase A Complete ===`);
        console.log(`Total executable edges: ${edges.length}`);
        console.log(`Total discrepancies: ${discrepancies.length}`);
        
        return { edges, discrepancies };
    }

    /**
     * Phase A2: Cross-pair discovery
     * Generate additional token pairs for cross-pair graph coverage
     */
    private generateCrossPairs(anchorToken: string, candidateTokens: string[]): { tokenA: string; tokenB: string }[] {
        const crossPairs: { tokenA: string; tokenB: string }[] = [];
        
        // Generate A↔B, A↔C, B↔C type relationships among candidate tokens
        for (let i = 0; i < candidateTokens.length; i++) {
            for (let j = i + 1; j < candidateTokens.length; j++) {
                crossPairs.push({
                    tokenA: candidateTokens[i],
                    tokenB: candidateTokens[j]
                });
            }
        }
        
        return crossPairs;
    }

    /**
     * Phase B: Form triangles from executable edges using arbitrage graph
     */
    public async formTrianglesFromEdges(
        edges: ArbitrageEdge[],
        anchorToken: string,
        testAmount: bigint
    ): Promise<TriangleCandidate[]> {
        console.log("\n=== Phase B: Building Arbitrage Graph ===");
        console.log(`Anchor token: ${anchorToken.slice(0,6)}`);
        console.log(`Total edges to use: ${edges.length}`);

        // Build directed graph from executable edges
        const graph = new Map<string, ArbitrageEdge[]>();
        
        for (const edge of edges) {
            if (!graph.has(edge.tokenIn)) {
                graph.set(edge.tokenIn, []);
            }
            graph.get(edge.tokenIn)!.push(edge);
        }

        console.log(`\n=== GRAPH EDGES ===`);
        for (const [tokenFrom, edgeList] of graph.entries()) {
            console.log(`  ${tokenFrom.slice(0,6)} → (${edgeList.length} edges)`);
            for (const edge of edgeList) {
                console.log(`    ${edge.tokenOut.slice(0,6)} (${edge.dex}) price=${edge.normalizedPrice.toFixed(6)} pool=${edge.pool.slice(0,8)}... fee=${edge.fee}`);
            }
        }
        
        console.log(`Graph built with ${graph.size} unique tokens`);
        
        // Find all cycles starting from anchor token
        const triangles: TriangleCandidate[] = [];
        
        // Start DFS from anchor token to find cycles
        await this.findCyclesFromAnchor(
            anchorToken,
            anchorToken,
            [anchorToken],
            [], // Start with empty runtimeLegs
            testAmount,
            graph,
            triangles,
            0,
            3 // Max depth (triangle = 3 edges)
        );

        console.log(`=== Phase B Complete: Found ${triangles.length} profitable triangles ===`);
        return triangles;
    }

    private async findCyclesFromAnchor(
        startToken: string,
        currentToken: string,
        path: string[],
        runtimeLegs: RuntimeLeg[],
        currentAmount: bigint,
        graph: Map<string, ArbitrageEdge[]>,
        triangles: TriangleCandidate[],
        depth: number,
        maxDepth: number
    ): Promise<void> {
        if (depth >= maxDepth) {
            // Check if we formed a cycle back to start
            if (currentToken === startToken && path.length === maxDepth + 1) {
                // Form a triangle candidate
                const candidate = await this.createTriangleCandidate(
                    path,
                    runtimeLegs,
                    currentAmount
                );
                if (candidate) {
                    triangles.push(candidate);
                }
            }
            return;
        }

        const availableEdges = graph.get(currentToken) || [];
        
        for (const edge of availableEdges) {
            // Avoid revisiting same token in this path (except anchor at end)
            if (edge.tokenOut === startToken && depth < maxDepth - 1) {
                continue; // Don't close cycle too early
            }
            
            if (path.includes(edge.tokenOut) && edge.tokenOut !== startToken) {
                continue; // Don't revisit non-anchor tokens
            }

            // Quote this edge with current amount
            try {
                const quote = await edge.dexProvider.quote({
                    tokenIn: edge.tokenIn,
                    tokenOut: edge.tokenOut,
                    amountIn: currentAmount
                });

                // Do not build graph edges from dust/rounding-only quotes.
                // A raw output of 1 is effectively zero for all supported tokens
                // and can create artificial percentage-profit spikes.
                if (!quote || quote.amountOut <= 1n) {
                    continue;
                }

                const newPath = [...path, edge.tokenOut];
                const newRuntimeLegs = [...runtimeLegs, {
                    edge,
                    amountIn: currentAmount,
                    amountOut: quote.amountOut
                }];
                
                await this.findCyclesFromAnchor(
                    startToken,
                    edge.tokenOut,
                    newPath,
                    newRuntimeLegs,
                    quote.amountOut, // Pass the actual quoted amountOut
                    graph,
                    triangles,
                    depth + 1,
                    maxDepth
                );
            } catch (error) {
                continue;
            }
        }
    }

    private async createTriangleCandidate(
        path: string[],
        runtimeLegs: RuntimeLeg[],
        finalAmount: bigint
    ): Promise<TriangleCandidate | null> {
        if (path.length !== 4 || runtimeLegs.length !== 3) {
            return null; // Not a valid triangle
        }

        const [tokenA, tokenB, tokenC, tokenA_verify] = path;
        if (tokenA !== tokenA_verify) {
            return null; // Not a valid cycle
        }

        const inputAmount = runtimeLegs[0].amountIn;
        const outputAmount = finalAmount;
        
        // Calculate profit using bigint arithmetic to avoid precision loss
        const rawProfit = outputAmount - inputAmount;
        
        // Convert to normalized profit percentage using decimals
        const inputDecimals = runtimeLegs[0].edge.tokenInDecimals;
        const outputDecimals = runtimeLegs[2].edge.tokenOutDecimals; // Last edge's output
        
        const inputNormalized = Number(formatUnits(inputAmount, inputDecimals));
        const outputNormalized = Number(formatUnits(outputAmount, outputDecimals));
        const rawProfitPercentage = (outputNormalized - inputNormalized) / inputNormalized;

        // Quality filters
        const dexVariety = new Set(runtimeLegs.map(leg => leg.edge.dex)).size;
        if (dexVariety < 2) {
            if (VERBOSE_LOGGING) {
                console.log(`    ❌ Single-DEX triangle skipped: ${runtimeLegs.map(leg => leg.edge.dex).join(' → ')}`);
            }
            return null; // Single-DEX triangle
        }

        if (rawProfitPercentage < this.minSpreadPercentage) {
            if (VERBOSE_LOGGING) {
                console.log(`    ❌ Low profit: ${(rawProfitPercentage * 100).toFixed(4)}% < ${(this.minSpreadPercentage * 100).toFixed(2)}%`);
            }
            return null; // Low profit
        }

        const routeName = `${tokenA.slice(0,6)} → ${tokenB.slice(0,6)} → ${tokenC.slice(0,6)} → ${tokenA.slice(0,6)}`;

        console.log(`    ${runtimeLegs[0].edge.dex} → ${runtimeLegs[1].edge.dex} → ${runtimeLegs[2].edge.dex}: ${(rawProfitPercentage * 100).toFixed(4)}%`);

        return {
            tokenA,
            tokenB,
            tokenC,
            legs: runtimeLegs.map((leg) => ({
                from: leg.edge.tokenIn,
                to: leg.edge.tokenOut,
                amountIn: leg.amountIn, // Use actual amount from runtime
                amountOut: leg.amountOut, // Use actual amount from runtime
                normalizedPrice: leg.edge.normalizedPrice,
                dex: leg.edge.dex,
                fee: leg.edge.fee,
                stable: leg.edge.stable,
                factory: leg.edge.factory,
                dexProvider: leg.edge.dexProvider
            })),
            inputAmount,
            outputAmount,
            rawProfit,
            rawProfitPercentage,
            routeName,
            qualityMetrics: {
                dexVariety,
                minLiquidity: 0, // Will be calculated from pool data
                maxInputLiquidityRatio: 0.01
            }
        };
    }
}
