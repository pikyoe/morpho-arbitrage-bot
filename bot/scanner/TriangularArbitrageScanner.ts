import { QuoteRequest, QuoteResult } from "./quote/index.js";
import { QuoteEngine } from "./QuoteEngine.js";
import { TOKENS, TOKEN_DECIMALS, parseUnits, formatUnits } from "./TokenList.js";
import { TriangleDiscoveryEngine, TriangleCandidate } from "./TriangleDiscoveryEngine.js";
import { DexQuoteProvider } from "./quote/DexQuoteProvider.js";
import { validateExecutableProfit, logCandidateValidation, validateOnChainQuote, ExecutableProfitInput, findOptimalAmount } from "../executor/ExecutionGuard.js";
import { ZeroXAggregator } from "./aggregator/ZeroXAggregator.js";
import { PoolCache } from "./PoolCache.js";

export interface TriangularRoute {
    tokenA: string;
    tokenB: string;
    tokenC: string;
    routeName: string;
}

export interface TriangularOpportunity {
    route: TriangularRoute;
    quotes: QuoteResult[]; // [A→B, B→C, C→A]
    inputAmount: bigint;
    outputAmount: bigint;
    profit: bigint;
    profitPercentage: number;
    steps: {
        from: string;
        to: string;
        amountIn: bigint;
        amountOut: bigint;
        dex: string;
    }[];
    qualityMetrics?: {
        dexVariety: number;
        minLiquidity: number;
        maxInputLiquidityRatio: number;
    };
}

export class TriangularArbitrageScanner {
    private quoteEngine: QuoteEngine;
    private discoveryEngine: TriangleDiscoveryEngine | null = null;
    private dexProviders: DexQuoteProvider[]; // Add DEX providers for direct quoting
    private zeroXAggregator: ZeroXAggregator | null = null; // 0x for validation only
    private poolCache: PoolCache; // Add pool cache for discovery engine
    private networkProvider: any; // Network provider for gas price fetching
    private discoveryQuoteEngine: QuoteEngine; // Separate quote engine for discovery (DEX providers only)
    private routes: TriangularRoute[];
    private currentRoutes: TriangularRoute[] = [
        // USDC → WETH → CBETH → USDC for testing
        // NOTE: tokenC must be a THIRD distinct token, different from tokenA and tokenB,
        // otherwise the final leg (tokenC -> tokenA) is a same-token "swap" (e.g. USDC->USDC)
        // which no DEX/aggregator can quote, so the route would never produce a real cycle.
        // Swap TOKENS.CBETH below for whichever third token actually has liquidity against
        // both USDC and WETH on your target DEXes.
        {
            tokenA: TOKENS.USDC,
            tokenB: TOKENS.WETH,
            tokenC: TOKENS.CBETH,
            routeName: "USDC → WETH → CBETH → USDC (Test)"
        }
    ];

    constructor(quoteEngine: QuoteEngine, poolCache: PoolCache, dexProviders?: DexQuoteProvider[], zeroXAggregator?: ZeroXAggregator, networkProvider?: any, discoveryQuoteEngine?: QuoteEngine) {
        this.quoteEngine = quoteEngine;
        this.poolCache = poolCache;
        this.dexProviders = dexProviders || [];
        this.zeroXAggregator = zeroXAggregator || null;
        this.networkProvider = networkProvider || null;
        this.discoveryQuoteEngine = discoveryQuoteEngine || quoteEngine; // Use discovery-specific quote engine if provided
        this.routes = this.currentRoutes;
        
        // Initialize discovery engine if DEX providers are provided
        // dexEdges will be set later via setDexEdges()
        if (dexProviders && dexProviders.length >= 2) {
            // Will be initialized when dexEdges is provided
        }
    }

    /**
     * Set DEX edges for discovery engine
     * This must be called after constructor with graph data from SubgraphPoolLoader
     */
    setDexEdges(dexEdges: Map<string, Map<string, Set<string>>>): void {
        if (this.dexProviders.length >= 2) {
            this.discoveryEngine = new TriangleDiscoveryEngine(
                this.dexProviders,
                dexEdges,
                this.poolCache,
                0.0005 // 0.05% minimum raw profit (further reduced for Base network)
            );
            console.log("✅ Discovery engine initialized with DEX graph edges");
        }
    }

    /**
     * Scan for triangular arbitrage opportunities using discovery engine
     * This is the new method that uses DEX-specific quotes for cross-DEX arbitrage discovery
     */
    async scanWithDiscovery(
        minProfitPercentage: number = 0.001, // 0.1% minimum profit (reduced from 0.5%)
        useOptimalSizing: boolean = true // Enable optimal amount sizing by default
    ): Promise<TriangularOpportunity[]> {
        if (!this.discoveryEngine) {
            console.log("Discovery engine not initialized, falling back to aggregator-based scan");
            return this.scanTriangularOpportunities(minProfitPercentage);
        }

        console.log(`[DISCOVERY] Starting scan with discovery engine for ${this.routes.length} routes`);
        console.log(`[DISCOVERY] Optimal sizing: ${useOptimalSizing ? 'enabled' : 'disabled'}`);
        const opportunities: TriangularOpportunity[] = [];

        for (const route of this.routes) {
            console.log(`[DISCOVERY] Scanning route: ${route.routeName}`);
            
            // Find optimal amount if enabled
            let routeAmount: bigint;
            if (useOptimalSizing) {
                const optimalResult = await this.findOptimalAmount(route);
                routeAmount = optimalResult.optimalAmount;
                console.log(`[DISCOVERY] Using optimal amount: ${Number(routeAmount) / 1e6} USDC (ROI: ${optimalResult.roi.toFixed(2)}%)`);
            } else {
                // Calculate correct amount based on first token's decimals
                const firstTokenDecimals = TOKEN_DECIMALS[route.tokenA.toLowerCase()];
                if (firstTokenDecimals === undefined) {
                    console.warn(`Unknown decimals for ${route.tokenA}, skipping route ${route.routeName}`);
                    continue;
                }
                
                // Use 1 unit of the first token with correct decimals
                routeAmount = 1n * (10n ** BigInt(firstTokenDecimals));
            }
            
            console.log(`[DISCOVERY] Input amount: ${routeAmount}`);
            
            try {
                const candidates = await this.discoveryEngine.discoverTriangularOpportunities(
                    route.tokenA,
                    route.tokenB,
                    route.tokenC,
                    routeAmount
                );
                
                console.log(`[DISCOVERY] Found ${candidates.length} candidates for ${route.routeName}`);

                for (const candidate of candidates) {
                    // Log quality metrics
                    if (candidate.qualityMetrics) {
                        console.log(`    Quality: ${candidate.qualityMetrics.dexVariety} DEX${candidate.qualityMetrics.dexVariety > 1 ? 's' : ''}, Min liquidity: $${candidate.qualityMetrics.minLiquidity.toLocaleString()}, Max ratio: ${(candidate.qualityMetrics.maxInputLiquidityRatio * 100).toFixed(2)}%`);
                    }
                    
                    // Convert TriangleCandidate to TriangularOpportunity
                    const opportunity: TriangularOpportunity = {
                        route,
                        quotes: candidate.legs.map(leg => ({
                            dex: leg.dex,
                            pool: "", // Pool address not needed for discovery
                            tokenIn: leg.from,
                            tokenOut: leg.to,
                            amountIn: leg.amountIn,
                            amountOut: leg.amountOut
                        })),
                        inputAmount: candidate.inputAmount,
                        outputAmount: candidate.outputAmount,
                        profit: candidate.rawProfit,
                        profitPercentage: candidate.rawProfitPercentage,
                        steps: candidate.legs.map(leg => ({
                            from: leg.from,
                            to: leg.to,
                            amountIn: leg.amountIn,
                            amountOut: leg.amountOut,
                            dex: leg.dex
                        })),
                        qualityMetrics: candidate.qualityMetrics
                    };

                    opportunities.push(opportunity);
                }
            } catch (error) {
                console.log(`Discovery failed for ${route.routeName}: ${error instanceof Error ? error.message : error}`);
            }
        }

        console.log(`[DISCOVERY] Total opportunities found: ${opportunities.length}`);
        return opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);
    }

    /**
     * Scan for triangular arbitrage opportunities (legacy method using aggregators)
     */
    async scanTriangularOpportunities(
        minProfitPercentage: number = 0.005 // 0.5% minimum profit
    ): Promise<TriangularOpportunity[]> {
        console.log(`[SCAN] scanTriangularOpportunities called with discoveryEngine: ${!!this.discoveryEngine}`);
        
        // If discovery engine is available, use it
        if (this.discoveryEngine) {
            console.log(`[SCAN] Using discovery engine`);
            return this.scanWithDiscovery(minProfitPercentage, true); // Enable optimal sizing
        }

        console.log(`[SCAN] Using legacy aggregator-based scan`);
        const opportunities: TriangularOpportunity[] = [];

        for (const route of this.routes) {
            // Calculate correct amount based on first token's decimals
            const firstTokenDecimals = TOKEN_DECIMALS[route.tokenA.toLowerCase()];
            if (firstTokenDecimals === undefined) {
                console.warn(`Unknown decimals for ${route.tokenA}, skipping route ${route.routeName}`);
                continue;
            }
            
            // Use 1 unit of the first token with correct decimals
            const routeAmount = 1n * (10n ** BigInt(firstTokenDecimals));
            
            const opportunity = await this.scanRoute(route, routeAmount, minProfitPercentage);
            if (opportunity) {
                opportunities.push(opportunity);
            }
        }

        return opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);
    }

    /**
     * Validate triangular opportunity with 0x before execution
     * Only validates profitable opportunities to save API calls
     * Can be controlled via ZEROX_VALIDATION_MODE in .env:
     * - "disabled": Skip 0x validation entirely
     * - "execution_only": Only call 0x for final validation before execution (recommended)
     * - "always": Call 0x for every opportunity discovery (may hit rate limits)
     */
    public async validateWithZeroX(opportunity: TriangularOpportunity): Promise<boolean> {
        const validationMode = process.env.ZEROX_VALIDATION_MODE || 'disabled';
        
        if (validationMode === 'disabled') {
            console.log("  0x validation: Disabled via ZEROX_VALIDATION_MODE=disabled");
            return true; // Allow execution based on subgraph quotes
        }
        
        // If 0x aggregator is not available, skip validation
        if (!this.zeroXAggregator || !this.zeroXAggregator.isEnabled()) {
            console.log("  0x validation: 0x aggregator not available, skipping");
            return true; // Allow execution based on subgraph quotes
        }
        
        // If mode is "execution_only", only validate if this is being called before actual execution
        // This allows skipping validation during discovery phase
        if (validationMode === 'execution_only') {
            // Check if we're in execution context (you'd need to add a flag or parameter)
            // For now, we'll validate as this function is only called before execution
            console.log("  0x validation: Enabled for execution phase only");
        }

        try {
            const { route, inputAmount } = opportunity;
            
            // Get 0x quote for the first leg of the triangular route (tokenA -> tokenB).
            // Previously this queried tokenA -> tokenA (a same-token "swap"), which no
            // aggregator can price, so the request always failed and silently fell through
            // to the catch block's `return true` — meaning validation never actually ran.
            // Quoting the real first leg lets us sanity-check the subgraph price against 0x.
            const zeroXQuote = await this.zeroXAggregator.getQuote({
                tokenIn: route.tokenA,
                tokenOut: route.tokenB,
                amountIn: inputAmount
            });

            if (!zeroXQuote) {
                console.log("  0x validation: No quote available, using subgraph quotes");
                return true; // Allow execution based on subgraph quotes
            }

            // Compare 0x's first-leg output with the subgraph's first-leg output
            const subgraphFirstLegOut = opportunity.steps[0].amountOut;
            const priceDiff = Math.abs(Number(zeroXQuote.amountOut - subgraphFirstLegOut)) / Number(subgraphFirstLegOut);
            
            if (priceDiff > 0.005) { // 0.5% max deviation
                console.log(`  0x validation: Price deviation ${(priceDiff * 100).toFixed(3)}% exceeds threshold, rejecting`);
                return false;
            }

            console.log(`  0x validation: Price deviation ${(priceDiff * 100).toFixed(3)}% acceptable`);
            return true;
        } catch (error) {
            console.log("  0x validation: Error, using subgraph quotes");
            return true; // Allow execution based on subgraph quotes on error
        }
    }

    /**
     * Find optimal flash loan amount for triangular arbitrage
     * Tests multiple amounts and selects the one with best net profit
     */
    public async findOptimalAmount(
        route: TriangularRoute,
        minAmount: bigint = 100000000n, // 100 USDC
        maxAmount: bigint = 10000000000n // 10,000 USDC
    ): Promise<{ optimalAmount: bigint; estimatedNetProfitUSD: number; roi: number }> {
        console.log(`[OPTIMAL SIZING] Finding optimal amount for ${route.routeName}`);
        
        // Debug: Check if discoveryQuoteEngine is contaminated
        console.log(`[OPTIMAL SIZING] DiscoveryQuoteEngine providers count: ${this.discoveryQuoteEngine ? 'configured' : 'NOT CONFIGURED'}`);
        
        try {
            const result = await findOptimalAmount(
                route,
                async (amount: bigint) => {
                    // Get quotes for triangular route with this amount (using DEX providers only)
                    const quotes: QuoteResult[] = [];
                    const usedDexes = new Set<string>();
                    
                    try {
                        // Leg 1: A → B - pick the best quote, preferring a DEX not yet used in this route
                        const allQuotes1 = await this.discoveryQuoteEngine.getAllQuotes({
                            tokenIn: route.tokenA,
                            tokenOut: route.tokenB,
                            amountIn: amount
                        });

                        const bestQuote1 = this.pickBestQuote(allQuotes1, usedDexes);
                        if (bestQuote1) {
                            quotes.push(bestQuote1);
                            usedDexes.add(bestQuote1.dex);
                        }
                        
                        // Leg 2: B → C
                        if (quotes.length > 0) {
                            const allQuotes2 = await this.discoveryQuoteEngine.getAllQuotes({
                                tokenIn: route.tokenB,
                                tokenOut: route.tokenC,
                                amountIn: quotes[0].amountOut
                            });
                            
                            const bestQuote2 = this.pickBestQuote(allQuotes2, usedDexes);
                            if (bestQuote2) {
                                quotes.push(bestQuote2);
                                usedDexes.add(bestQuote2.dex);
                            }
                            
                            // Leg 3: C → A
                            if (quotes.length > 1) {
                                const allQuotes3 = await this.discoveryQuoteEngine.getAllQuotes({
                                    tokenIn: route.tokenC,
                                    tokenOut: route.tokenA,
                                    amountIn: quotes[1].amountOut
                                });
                                
                                const bestQuote3 = this.pickBestQuote(allQuotes3, usedDexes);
                                if (bestQuote3) {
                                    quotes.push(bestQuote3);
                                    usedDexes.add(bestQuote3.dex);
                                }
                            }
                        }
                    } catch (error) {
                        console.log(`  Quote failed for ${Number(amount) / 1e6} USDC: ${error instanceof Error ? error.message : error}`);
                    }
                    
                    return quotes;
                },
                async (amount: bigint) => {
                    // Estimate costs for this amount with online gas price
                    try {
                        // Get current gas price from network
                        let gasPrice = 0.02e9; // Fallback: 0.02 gwei in wei
                        let ethPriceUSD = 1907; // Fallback: Current ETH price $1.907
                        
                        // Try to get gas price from network provider
                        if (this.networkProvider) {
                            try {
                                const feeData = await this.networkProvider.getFeeData();
                                // Use maxFeePerGas for EIP-1559 networks, fallback to gasPrice
                                gasPrice = feeData.maxFeePerGas || feeData.gasPrice || gasPrice;
                            } catch (error) {
                                console.log(`  Failed to get gas price, using fallback: ${error instanceof Error ? error.message : error}`);
                            }
                        }
                        
                        // Get ETH price from API (CoinGecko) with timeout
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                            
                            const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
                                signal: controller.signal
                            });
                            clearTimeout(timeoutId);
                            
                            if (response.ok) {
                                const data = await response.json();
                                if (data.ethereum?.usd) {
                                    ethPriceUSD = data.ethereum.usd;
                                }
                            }
                        } catch (error) {
                            console.log(`  Failed to get ETH price, using fallback $1.907: ${error instanceof Error ? error.message : error}`);
                        }
                        
                        const gasLimit = 500000n; // Estimated gas limit for triangular arbitrage
                        const gasCostWei = BigInt(Math.floor(Number(gasPrice))) * gasLimit;
                        const gasCostETH = Number(gasCostWei) / 1e18;
                        const gasCostUSD = gasCostETH * ethPriceUSD;
                        
                        // Flash loan fee (Morpho: 0.05% of loan amount)
                        const flashLoanFeeUSD = (Number(amount) / 1e6) * 0.0005;
                        
                        console.log(`  Gas price: ${Number(gasPrice) / 1e9} gwei, ETH price: $${ethPriceUSD}, Gas cost: $${gasCostUSD.toFixed(4)}`);
                        
                        return { gasCostUSD, flashLoanFeeUSD };
                    } catch (error) {
                        console.log(`  Cost estimation failed, using fallback: ${error instanceof Error ? error.message : error}`);
                        // Fallback calculation
                        const gasPrice = 0.02e9; // 0.02 gwei in wei
                        const gasLimit = 500000n;
                        const gasCostWei = BigInt(Math.floor(gasPrice)) * gasLimit;
                        const gasCostUSD = Number(gasCostWei) / 1e18 * 1.907; // Current ETH price
                        const flashLoanFeeUSD = (Number(amount) / 1e6) * 0.0005;
                        return { gasCostUSD, flashLoanFeeUSD };
                    }
                },
                Number(minAmount) / 1e6,
                Number(maxAmount) / 1e6,
                6 // Test 6 amounts: 100, 500, 1k, 2k, 5k, 10k
            );
            
            return {
                optimalAmount: result.optimalAmount,
                estimatedNetProfitUSD: result.estimatedNetProfitUSD,
                roi: result.roi
            };
        } catch (error) {
            console.log(`[OPTIMAL SIZING] Error finding optimal amount: ${error instanceof Error ? error.message : error}`);
            // Fallback to minimum amount
            return {
                optimalAmount: minAmount,
                estimatedNetProfitUSD: 0,
                roi: 0
            };
        }
    }

    /**
     * Pick the best quote for a leg, preferring one from a DEX not already used
     * elsewhere in this triangle (so all three legs aren't accidentally filled
     * from the same DEX, which defeats the purpose of cross-DEX arbitrage).
     * Falls back to the best-priced quote overall if every DEX is already used.
     */
    private pickBestQuote(quotes: QuoteResult[], usedDexes: Set<string>): QuoteResult | null {
        if (quotes.length === 0) return null;

        const unused = quotes.filter(q => !usedDexes.has(q.dex));
        const pool = unused.length > 0 ? unused : quotes;

        return pool.reduce((best, current) => (current.amountOut > best.amountOut ? current : best));
    }

    /**
     * Scan a specific triangular route
     */
    private async scanRoute(
        route: TriangularRoute,
        inputAmount: bigint,
        minProfitPercentage: number
    ): Promise<TriangularOpportunity | null> {
        try {
            // Get quotes for each step in the triangle
            const quoteAB = await this.getQuote(route.tokenA, route.tokenB, inputAmount);
            if (!quoteAB) {
                console.log(`  ${route.routeName}: No quote available`);
                return null;
            }

            const quoteBC = await this.getQuote(route.tokenB, route.tokenC, quoteAB.amountOut);
            if (!quoteBC) {
                console.log(`  ${route.routeName}: No quote available`);
                return null;
            }

            const quoteCA = await this.getQuote(route.tokenC, route.tokenA, quoteBC.amountOut);
            if (!quoteCA) {
                console.log(`  ${route.routeName}: No quote available`);
                return null;
            }

            // Calculate final profit
            const outputAmount = quoteCA.amountOut;
            const profit = outputAmount - inputAmount;
            const profitPercentage = Number(profit) / Number(inputAmount);

            // Log profit calculation per leg with actual amounts
            const decimals = TOKEN_DECIMALS[route.tokenA.toLowerCase()] || 18;
            const inputFormatted = formatUnits(inputAmount, decimals);
            const outputFormatted = formatUnits(outputAmount, decimals);
            
            const leg1Out = formatUnits(quoteAB.amountOut, TOKEN_DECIMALS[route.tokenB.toLowerCase()] || 18);
            const leg2Out = formatUnits(quoteBC.amountOut, TOKEN_DECIMALS[route.tokenC.toLowerCase()] || 18);
            const leg3Out = formatUnits(quoteCA.amountOut, decimals);
            
            console.log(`  ${route.routeName}:`);
            console.log(`    ${route.tokenA.slice(0,6)} → ${route.tokenB.slice(0,6)}: ${inputFormatted} → ${leg1Out}`);
            console.log(`    ${route.tokenB.slice(0,6)} → ${route.tokenC.slice(0,6)}: ${leg1Out} → ${leg2Out}`);
            console.log(`    ${route.tokenC.slice(0,6)} → ${route.tokenA.slice(0,6)}: ${leg2Out} → ${leg3Out}`);
            console.log(`    TOTAL: ${inputFormatted} → ${outputFormatted} (${profitPercentage > 0 ? '+' : ''}${(profitPercentage * 100).toFixed(4)}%) ${profitPercentage > 0 ? '✅' : '❌'}`);

            // Check if profit meets minimum threshold
            if (profitPercentage < minProfitPercentage) {
                return null;
            }

            // Build triangular opportunity (without 0x validation initially)
            const opportunity = {
                route,
                quotes: [quoteAB, quoteBC, quoteCA],
                inputAmount,
                outputAmount,
                profit,
                profitPercentage,
                steps: [
                    {
                        from: route.tokenA,
                        to: route.tokenB,
                        amountIn: inputAmount,
                        amountOut: quoteAB.amountOut,
                        dex: quoteAB.dex
                    },
                    {
                        from: route.tokenB,
                        to: route.tokenC,
                        amountIn: quoteAB.amountOut,
                        amountOut: quoteBC.amountOut,
                        dex: quoteBC.dex
                    },
                    {
                        from: route.tokenC,
                        to: route.tokenA,
                        amountIn: quoteBC.amountOut,
                        amountOut: quoteCA.amountOut,
                        dex: quoteCA.dex
                    }
                ]
            };

            return opportunity;
        } catch (error) {
            console.error(`Error scanning route ${route.routeName}:`, error);
            return null;
        }
    }

    /**
     * Get quote between two tokens
     */
    private async getQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
        try {
            const quotes = await this.quoteEngine.getAllQuotes({
                tokenIn,
                tokenOut,
                amountIn
            });

            if (quotes.length === 0) return null;

            // Return the quote with the best output amount
            return quotes.reduce((best, current) => (current.amountOut > best.amountOut ? current : best));
        } catch (error) {
            console.error(`Error getting quote ${tokenIn} → ${tokenOut}:`, error);
            return null;
        }
    }

    /**
     * Add custom triangular route
     */
    addRoute(route: TriangularRoute): void {
        this.routes.push(route);
    }

    /**
     * Set custom routes
     */
    setRoutes(routes: TriangularRoute[]): void {
        this.routes = routes;
    }

    /**
     * Get available routes
     */
    getRoutes(): TriangularRoute[] {
        return this.routes;
    }
}