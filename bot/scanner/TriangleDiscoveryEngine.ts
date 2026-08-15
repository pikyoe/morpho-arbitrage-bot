import { DexQuoteProvider } from "./quote/DexQuoteProvider.js";
import { QuoteRequest, QuoteResult } from "./quote/index.js";
import { TOKENS, TOKEN_DECIMALS, formatUnits } from "./TokenList.js";
import { PoolCache } from "./PoolCache.js";

export interface TriangleLeg {
    from: string;
    to: string;
    amountIn: bigint;
    amountOut: bigint;
    dex: string;
    dexProvider: DexQuoteProvider;
}

export interface TriangleCandidate {
    tokenA: string;
    tokenB: string;
    tokenC: string;
    legs: TriangleLeg[]; // [A→B, B→C, C→A]
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

/**
 * Triangle Discovery Engine
 * 
 * This engine discovers triangular arbitrage opportunities by:
 * 1. Getting DEX-specific quotes (not aggregated quotes)
 * 2. Generating all possible DEX combinations for 3 legs
 * 3. Calculating raw profit from DEX-specific quotes
 * 4. Returning candidates with raw profit > 0
 * 
 * The key insight is that we want to find price discrepancies BETWEEN DEXes,
 * not just the best route overall. So we quote each leg from specific DEXes.
 */
export class TriangleDiscoveryEngine {
    private dexProviders: DexQuoteProvider[];
    private dexEdges: Map<string, Map<string, Set<string>>>;
    private poolCache: PoolCache;
    private minRawProfitPercentage: number;
    private minLiquidityPerLeg: number;
    private maxInputLiquidityRatio: number;
    private minDexVariety: number;

    constructor(
        dexProviders: DexQuoteProvider[],
        dexEdges: Map<string, Map<string, Set<string>>>,
        poolCache: PoolCache,
        minRawProfitPercentage: number = 0.0005 // 0.05% minimum raw profit (reduced from 0.1%)
    ) {
        this.dexProviders = dexProviders.filter(p => p.isEnabled());
        this.dexEdges = dexEdges;
        this.poolCache = poolCache;
        this.minRawProfitPercentage = minRawProfitPercentage;
        
        // Quality filters for triangle arbitrage (further relaxed for Base network)
        this.minLiquidityPerLeg = 5000; // $5k minimum liquidity per leg (reduced from $10k)
        this.maxInputLiquidityRatio = 0.05; // Maximum 5% input/pool liquidity ratio
        // Was 1, which made the "STRICT" cross-DEX check below a no-op (dexVariety
        // is always >= 1, so `dexVariety < 1` never triggers). Set to 2 so this
        // filter actually enforces cross-DEX arbitrage as its comment claims.
        this.minDexVariety = 2; // Minimum 2 different DEXes (reject single-DEX triangles)
        
        // Debug: Log all DEX providers
        console.log("\n=== TriangleDiscoveryEngine DEX Providers ===");
        for (const provider of this.dexProviders) {
            console.log(`  ${provider.getDexName()}`);
        }
        
        console.log("\n=== Triangle Quality Filters ===");
        console.log(`  Minimum raw profit: ${(this.minRawProfitPercentage * 100).toFixed(2)}%`);
        console.log(`  Minimum liquidity per leg: $${this.minLiquidityPerLeg.toLocaleString()}`);
        console.log(`  Maximum input/liquidity ratio: ${(this.maxInputLiquidityRatio * 100).toFixed(1)}%`);
        console.log(`  Minimum DEX variety: ${this.minDexVariety} different DEXes`);
        
        // Debug: Log dexEdges structure
        console.log("\n=== DEX Edges Debug ===");
        console.log(`Total DEXes in graph: ${dexEdges.size}`);
        for (const [dexName, tokenEdges] of dexEdges.entries()) {
            console.log(`  ${dexName}: ${tokenEdges.size} tokens`);
            // Log first few tokens as example
            let count = 0;
            for (const [tokenIn, connectedTokens] of tokenEdges.entries()) {
                if (count < 3) {
                    console.log(`    ${tokenIn.slice(0,6)}... → ${connectedTokens.size} tokens`);
                    count++;
                }
            }
        }
        
        // Debug: Check specific tokens
        const testTokens = ['0x8335', '0x0b3e', '0x4200'];
        console.log("\n=== Specific Token Check ===");
        for (const token of testTokens) {
            for (const [dexName, tokenEdges] of dexEdges.entries()) {
                const connections = tokenEdges.get(token);
                if (connections) {
                    console.log(`  ${token.slice(0,6)} in ${dexName}: ${connections.size} connections`);
                }
            }
        }
    }

    /**
     * Discover triangular arbitrage opportunities for a specific token trio
     * 
     * @param tokenA First token (e.g., USDC)
     * @param tokenB Second token (e.g., WETH)
     * @param tokenC Third token (e.g., AERO)
     * @param inputAmount Amount to start with (in tokenA)
     * @returns Array of triangle candidates with raw profit > 0
     */
    async discoverTriangularOpportunities(
        tokenA: string,
        tokenB: string,
        tokenC: string,
        inputAmount: bigint
    ): Promise<TriangleCandidate[]> {
        const candidates: TriangleCandidate[] = [];

        // Get all enabled DEX providers
        const enabledProviders = this.dexProviders.filter(p => p.isEnabled());
        
        if (enabledProviders.length === 0) {
            // No DEX providers available
            return candidates;
        }

        // Generate all possible DEX combinations for 3 legs
        // For example: Aerodrome → Uniswap → Aerodrome
        // Pre-filter based on actual pool availability from dexEdges
        const dexCombinations = this.generateDexCombinations(
            tokenA,
            tokenB,
            tokenC,
            3,
            enabledProviders.length
        );

        console.log(`  Testing ${dexCombinations.length} DEX combinations for ${tokenA.slice(0,6)} → ${tokenB.slice(0,6)} → ${tokenC.slice(0,6)}`);

        for (const dexCombo of dexCombinations) {
            try {
                const candidate = await this.testTriangle(
                    tokenA,
                    tokenB,
                    tokenC,
                    inputAmount,
                    dexCombo
                );

                if (candidate) {
                    candidates.push(candidate);
                }
            } catch (error) {
                // Skip this combination if it fails
                continue;
            }
        }

        // Sort by raw profit percentage (descending)
        candidates.sort((a, b) => b.rawProfitPercentage - a.rawProfitPercentage);

        return candidates;
    }

    /**
     * Test a specific DEX combination for a triangle
     * 
     * @param tokenA First token
     * @param tokenB Second token
     * @param tokenC Third token
     * @param inputAmount Starting amount
     * @param dexCombo Array of 3 DEX providers for each leg
     * @returns Triangle candidate if profitable, null otherwise
     */
    private async testTriangle(
        tokenA: string,
        tokenB: string,
        tokenC: string,
        inputAmount: bigint,
        dexCombo: DexQuoteProvider[]
    ): Promise<TriangleCandidate | null> {
        // Validate that all providers are actual DEX providers (not aggregators)
        for (const provider of dexCombo) {
            const dexName = provider.getDexName();
            if (dexName === "0X" || dexName === "HYBRID") {
                console.error(`❌ ERROR: Non-DEX provider detected: ${dexName}`);
                return null;
            }
        }
        
        // Leg 1: A → B
        const quoteAB = await dexCombo[0].quote({
            tokenIn: tokenA,
            tokenOut: tokenB,
            amountIn: inputAmount
        });

        if (!quoteAB) {
            console.log(`    ${dexCombo[0].getDexName()}(${tokenA.slice(0,6)}→${tokenB.slice(0,6)}): No quote`);
            return null;
        }

        // Leg 2: B → C
        const quoteBC = await dexCombo[1].quote({
            tokenIn: tokenB,
            tokenOut: tokenC,
            amountIn: quoteAB.amountOut
        });

        if (!quoteBC) {
            console.log(`    ${dexCombo[1].getDexName()}(${tokenB.slice(0,6)}→${tokenC.slice(0,6)}): No quote`);
            return null;
        }

        // Leg 3: C → A
        const quoteCA = await dexCombo[2].quote({
            tokenIn: tokenC,
            tokenOut: tokenA,
            amountIn: quoteBC.amountOut
        });

        if (!quoteCA) {
            console.log(`    ${dexCombo[2].getDexName()}(${tokenC.slice(0,6)}→${tokenA.slice(0,6)}): No quote`);
            return null;
        }

        // Calculate raw profit
        const outputAmount = quoteCA.amountOut;
        const rawProfit = outputAmount - inputAmount;

        if (rawProfit <= 0n) {
            console.log(`    ❌ No profit: output=${outputAmount.toString()} vs input=${inputAmount.toString()}`);
            return null;
        }

        // Exact integer calculation in basis points
        const rawProfitBps =
            rawProfit * 10000n / inputAmount;

        const rawProfitPct = Number(rawProfitBps) / 10000;
        console.log(`    Raw profit: ${rawProfitPct.toFixed(4)}% (${rawProfitBps.toString()} bps)`);

        // Minimum raw profit threshold
        if (rawProfitBps < BigInt(Math.round(this.minRawProfitPercentage * 10000))) {
            console.log(`    ❌ Filtered: Profit below threshold (${rawProfitPct.toFixed(4)}% < ${(this.minRawProfitPercentage * 100).toFixed(2)}%)`);
            return null;
        }

        // QUALITY FILTERS
        
        // 1. Minimum DEX variety (cross-DEX arbitrage requirement) - STRICT
        const dexVariety = new Set(dexCombo.map(p => p.getDexName())).size;
        if (dexVariety < this.minDexVariety) {
            // Reject single-DEX triangles (e.g., all Uniswap)
            console.log(`    ❌ Filtered: Single-DEX triangle (${dexCombo.map(p => p.getDexName()).join(' → ')}) - Only ${dexVariety} DEX${dexVariety > 1 ? 's' : ''}`);
            return null;
        }
        
        console.log(`    ✅ DEX variety check passed: ${dexVariety} different DEX${dexVariety > 1 ? 's' : ''}`);

        // 2. Minimum liquidity per leg
        for (const quote of [quoteAB, quoteBC, quoteCA]) {
            const pool = this.poolCache.get(quote.pool);
            if (!pool) continue;
            
            const liquidityUSD = pool.reserveUSD;
            console.log(`    Liquidity check: pool=${quote.pool.slice(0,8)} liquidity=$${liquidityUSD.toLocaleString()}`);
            if (liquidityUSD < this.minLiquidityPerLeg) {
                console.log(`    ❌ Filtered: Low liquidity leg ($${liquidityUSD.toLocaleString()} < $${this.minLiquidityPerLeg.toLocaleString()})`);
                return null;
            }
        }
        console.log(`    ✅ Liquidity check passed`);

        // 3. Maximum input/liquidity ratio (prevent excessive price impact)
        // IMPORTANT: inputAmount is denominated in tokenA, which is NOT always USDC
        // (e.g. a WETH->CBETH->USDC->WETH route has tokenA = WETH, 18 decimals).
        // Previously this hardcoded `/ 1e6`, which silently assumed 6-decimal USDC
        // and produced wildly wrong USD values (and therefore wrong ratio-filter
        // decisions) for any route whose tokenA isn't a 6-decimal stablecoin.
        const tokenADecimals = TOKEN_DECIMALS[tokenA.toLowerCase()] ?? 18;
        const inputUSD = Number(formatUnits(inputAmount, tokenADecimals));
        console.log(`    Input amount: $${inputUSD.toFixed(2)}`);
        for (const quote of [quoteAB, quoteBC, quoteCA]) {
            const pool = this.poolCache.get(quote.pool);
            if (!pool) continue;
            
            const liquidityUSD = pool.reserveUSD;
            const ratio = inputUSD / liquidityUSD;
            console.log(`    Ratio check: pool=${quote.pool.slice(0,8)} ratio=${(ratio * 100).toFixed(2)}%`);
            
            if (ratio > this.maxInputLiquidityRatio) {
                console.log(`    ❌ Filtered: High input/liquidity ratio (${(ratio * 100).toFixed(2)}% > ${(this.maxInputLiquidityRatio * 100).toFixed(1)}%)`);
                return null;
            }
        }
        console.log(`    ✅ Ratio check passed`);

        // Display only
        const rawProfitPercentage =
            Number(rawProfitBps) / 10000;

        const dexComboStr = dexCombo.map(p => p.getDexName()).join(" → ");
        console.log(
            `    ${dexComboStr}: ` +
            `${(rawProfitPercentage * 100).toFixed(4)}% ` +
            `[${dexVariety} DEX${dexVariety > 1 ? 's' : ''}]`
        );

        // Calculate quality metrics
        let minLiquidity = Infinity;
        let maxInputLiquidityRatio = 0;
        
        for (const quote of [quoteAB, quoteBC, quoteCA]) {
            const pool = this.poolCache.get(quote.pool);
            if (pool) {
                minLiquidity = Math.min(minLiquidity, pool.reserveUSD);
                const ratio = inputUSD / pool.reserveUSD;
                maxInputLiquidityRatio = Math.max(maxInputLiquidityRatio, ratio);
            }
        }

        const routeName = `${tokenA.slice(0,6)} → ${tokenB.slice(0,6)} → ${tokenC.slice(0,6)} → ${tokenA.slice(0,6)}`;

        return {
            tokenA,
            tokenB,
            tokenC,
            legs: [
                {
                    from: tokenA,
                    to: tokenB,
                    amountIn: inputAmount,
                    amountOut: quoteAB.amountOut,
                    dex: dexCombo[0].getDexName(),
                    dexProvider: dexCombo[0]
                },
                {
                    from: tokenB,
                    to: tokenC,
                    amountIn: quoteAB.amountOut,
                    amountOut: quoteBC.amountOut,
                    dex: dexCombo[1].getDexName(),
                    dexProvider: dexCombo[1]
                },
                {
                    from: tokenC,
                    to: tokenA,
                    amountIn: quoteBC.amountOut,
                    amountOut: quoteCA.amountOut,
                    dex: dexCombo[2].getDexName(),
                    dexProvider: dexCombo[2]
                }
            ],
            inputAmount,
            outputAmount,
            rawProfit,
            rawProfitPercentage,
            routeName,
            qualityMetrics: {
                dexVariety,
                minLiquidity,
                maxInputLiquidityRatio
            }
        };
    }

    /**
     * Generate all possible DEX combinations for N legs
     * Pre-filter based on actual pool availability from dexEdges
     * 
     * @param tokenA First token
     * @param tokenB Second token
     * @param tokenC Third token
     * @param numLegs Number of legs in the triangle (usually 3)
     * @param numProviders Number of enabled providers (for cross-DEX logic)
     * @returns Array of DEX provider combinations
     */
    private generateDexCombinations(
        tokenA: string,
        tokenB: string,
        tokenC: string,
        numLegs: number,
        numProviders: number
    ): DexQuoteProvider[][] {
        const combinations: DexQuoteProvider[][] = [];

        if (this.dexProviders.length === 0) {
            return combinations;
        }

        // Build a map of provider by DEX name for quick lookup
        const providerMap = new Map<string, DexQuoteProvider>();
        for (const provider of this.dexProviders) {
            providerMap.set(provider.getDexName(), provider);
        }

        // For each leg, find which DEXes have pools for that pair
        const leg1Dexes = this.getDexesForPair(tokenA, tokenB, providerMap);
        const leg2Dexes = this.getDexesForPair(tokenB, tokenC, providerMap);
        const leg3Dexes = this.getDexesForPair(tokenC, tokenA, providerMap);

        console.log(`  Available DEXes for legs:`);
        console.log(`    ${tokenA.slice(0,6)}→${tokenB.slice(0,6)}: ${leg1Dexes.map(p => p.getDexName()).join(', ')}`);
        console.log(`    ${tokenB.slice(0,6)}→${tokenC.slice(0,6)}: ${leg2Dexes.map(p => p.getDexName()).join(', ')}`);
        console.log(`    ${tokenC.slice(0,6)}→${tokenA.slice(0,6)}: ${leg3Dexes.map(p => p.getDexName()).join(', ')}`);

        // Generate combinations only from available DEXes for each leg
        for (const dex1 of leg1Dexes) {
            for (const dex2 of leg2Dexes) {
                for (const dex3 of leg3Dexes) {
                    const combo = [dex1, dex2, dex3];
                    
                    // Filter: at least 2 different DEXes (unless only 1 provider available)
                    const uniqueDexes = new Set(combo.map(p => p.getDexName()));
                    if (numProviders === 1 || uniqueDexes.size >= 2) {
                        combinations.push(combo);
                    }
                }
            }
        }

        console.log(`  Generated ${combinations.length} valid combinations (pre-filtered by pool availability)`);
        return combinations;
    }

    /**
     * Get DEX providers that have pools for a specific token pair
     * Uses pool data directly instead of dexEdges for more accurate results
     * 
     * @param tokenIn Input token
     * @param tokenOut Output token
     * @param providerMap Map of DEX name to provider
     * @returns Array of providers that have pools for this pair
     */
    private getDexesForPair(
        tokenIn: string,
        tokenOut: string,
        providerMap: Map<string, DexQuoteProvider>
    ): DexQuoteProvider[] {
        const availableProviders: DexQuoteProvider[] = [];
        const tokenInLower = tokenIn.toLowerCase();
        const tokenOutLower = tokenOut.toLowerCase();

        // Debug: Log check for this pair
        console.log(`    Checking ${tokenInLower.slice(0,6)}→${tokenOutLower.slice(0,6)}:`);
        
        // Use pool data directly instead of dexEdges
        const pools = this.poolCache.getAll();
        
        // Find which DEXes have pools for this pair
        const dexesWithPool = new Set<string>();
        for (const pool of pools) {
            const poolToken0 = pool.token0.toLowerCase();
            const poolToken1 = pool.token1.toLowerCase();
            const poolDex = pool.dex;
            
            // Check if this pool matches our pair
            if ((poolToken0 === tokenInLower && poolToken1 === tokenOutLower) ||
                (poolToken1 === tokenInLower && poolToken0 === tokenOutLower)) {
                dexesWithPool.add(poolDex);
            }
        }
        
        // Map pool DEX names to provider DEX names
        const dexNameMap: { [key: string]: string } = {
            'UNISWAP': 'UniswapV3',
            'SUSHISWAP': 'SushiSwap',
            'PANCAKESWAP': 'PancakeSwap'
        };
        
        for (const poolDex of dexesWithPool) {
            const normalizedDex = poolDex.toUpperCase();
            const providerDexName = dexNameMap[normalizedDex] || poolDex;
            const provider = providerMap.get(providerDexName);
            console.log(`      ${providerDexName}: provider found? ${!!provider}, enabled? ${provider?.isEnabled()}`);
            if (provider && provider.isEnabled()) {
                availableProviders.push(provider);
            }
        }
        
        console.log(`      Result: ${availableProviders.length} providers`);
        return availableProviders;
    }

    /**
     * Get statistics about the discovery engine
     */
    getStats(): {
        totalProviders: number;
        enabledProviders: number;
        providerNames: string[];
    } {
        return {
            totalProviders: this.dexProviders.length,
            enabledProviders: this.dexProviders.filter(p => p.isEnabled()).length,
            providerNames: this.dexProviders.map(p => p.getDexName())
        };
    }
}