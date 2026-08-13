import { setTimeout as sleep } from "timers/promises";
import { JsonRpcProvider, Wallet, WebSocketProvider, ethers as ethersLib, parseUnits } from "ethers";
import { TOKENS } from "../../bot/scanner/TokenList.js";
import { getActiveUniverse } from "../../bot/scanner/TokenUniverse.js";
import { convertUSDToUSDC } from "../../bot/utils/USDAmountConverter.js";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { RpcPoolLoader, createWebSocketProvider } from "../../bot/scanner/RpcPoolLoader.js";
import { PoolStateCache } from "../../bot/scanner/state/PoolStateCache.js";
import { UniswapPoolStateLoader } from "../../bot/scanner/state/UniswapPoolStateLoader.js";
import { AerodromePoolStateLoader } from "../../bot/scanner/state/AerodromePoolStateLoader.js";
import { PoolStateLoader } from "../../bot/scanner/state/PoolStateLoader.js";
import { PoolStateScheduler } from "../../bot/scanner/state/PoolStateScheduler.js";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { OptimizedMarketPairScanner } from "../../bot/scanner/OptimizedMarketPairScanner.js";
import { BlockEventScanner } from "../../bot/scanner/BlockEventScanner.js";
import { PriceOracle } from "../../bot/oracle/PriceOracle.js";
import { UniswapQuote } from "../../bot/scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../../bot/scanner/quote/AerodromeQuote.js";
import { PancakeSwapQuote } from "../../bot/scanner/quote/PancakeSwapQuote.js";
import { OneInchAggregator } from "../../bot/scanner/aggregator/OneInchAggregator.js";
import { ZeroXAggregator } from "../../bot/scanner/aggregator/ZeroXAggregator.js";
import { HybridAggregator } from "../../bot/scanner/aggregator/HybridAggregator.js";
import { HybridAggregatorProvider } from "../../bot/scanner/quote/HybridAggregatorProvider.js";
import { TriangularArbitrageScanner } from "../../bot/scanner/TriangularArbitrageScanner.js";
import { TriangleDiscoveryEngine } from "../../bot/scanner/TriangleDiscoveryEngine.js";
import { DiscrepancyDiscoveryEngine } from "../../bot/scanner/DiscrepancyDiscoveryEngine.js";
import { UniswapV3DexProvider } from "../../bot/scanner/quote/UniswapV3DexProvider.js";
import { SushiSwapDexProvider } from "../../bot/scanner/quote/SushiSwapDexProvider.js";
import { PancakeSwapDexProvider } from "../../bot/scanner/quote/PancakeSwapDexProvider.js";
import { AerodromeDexProvider } from "../../bot/scanner/quote/AerodromeDexProvider.js";
import { DexQuoteProvider } from "../../bot/scanner/quote/DexQuoteProvider.js";
import { DexProviderAdapter } from "../../bot/scanner/quote/DexProviderAdapter.js";
import { AdapterRegistry } from "../../bot/registry/AdapterRegistry.js";
import { RouteBuilder } from "../../bot/RouteBuilder.js";
import { TOKENS, TOKEN_DECIMALS, parseUnits } from "../../bot/scanner/TokenList.js";
import { PoolInfo } from "../../bot/scanner/PoolTypes.js";
import { FlashLoanExecutor } from "../../bot/executor/FlashLoanExecutor.js";
import { evaluateExecutionSafety } from "../../bot/executor/ExecutionGuard.js";
import { OpportunityFilter, FilterConfig } from "../../bot/filter/OpportunityFilter.js";
import { OpportunityLogger } from "../../bot/logger/OpportunityLogger.js";
import { OpportunityRepository } from "../../bot/repository/OpportunityRepository.js";
import { CircuitBreaker, CircuitBreakerConfig } from "../../bot/circuit/CircuitBreaker.js";
import { ConfigValidator } from "../utils/ConfigValidator.js";
import { getQuoteCache } from "../../bot/scanner/QuoteCache.js";
import { RateLimiter, rpcRateLimiter, quoteRateLimiter, stateRateLimiter } from "../../bot/utils/RateLimiter.js";
import { getMultiRPCManager } from "../../bot/utils/MultiRPCManager.js";
import hre from "hardhat";

// Caching and rate limiting configuration
const ENABLE_CACHING = true;
const ENABLE_RATE_LIMITING = true;
const ENABLE_MULTI_RPC = true;
const ENABLE_EVENT_BASED_SCANNING = true; // Set to true for WebSocket-based scanning
const SCAN_INTERVAL_MS = 60000; // 60 seconds for production to prevent API rate limits
const MAX_POOLS = 200; // Increased from 20 to allow more triangle discovery
const SKIP_POOL_STATE_REFRESH = true; // Skip pool state refresh to reduce eth_calls (scheduler has compatibility issues)
const TOP_N_FORWARD_QUOTES = 1; // Reduced to 1 for maximum RPC reduction
const MIN_LIQUIDITY_ETH = 5; // Skip pools with liquidity below threshold
const MAX_PRICE_IMPACT = 0.015; // Maximum acceptable price impact fraction (1.5%)
const MIN_NET_PROFIT_USD = 1; // Reduced from 5 to 1 for more opportunities
const MIN_GROSS_PROFIT_USD = 5; // Reduced from 10 to 5 for more opportunities
const MAX_LOAN_USD = 10000; // Cap exposure per trade
const MAX_QUOTE_AGE_MS = 10000; // Reject stale quotes older than 10s

// Single test amount for discovery (just to find discrepancies)
// Use USDC amount for consistent pricing across all pairs
// Optimal amount will be determined during execution by findOptimalAmount
const TEST_AMOUNTS_USD = [500]; // $500 USD for discovery

// Convert USD to USDC amount for discovery
const TEST_AMOUNTS = TEST_AMOUNTS_USD.map(amount => convertUSDToUSDC(amount));

function getPoolPairKey(pool: PoolInfo): string {
    const tokens = [pool.token0.toLowerCase(), pool.token1.toLowerCase()];
    tokens.sort();
    return `${tokens[0]}-${tokens[1]}`;
}

function filterMultiDexPairs(pools: PoolInfo[]): PoolInfo[] {
    const pairDexMap = new Map<string, Set<string>>();

    for (const pool of pools) {
        const key = getPoolPairKey(pool);
        if (!pairDexMap.has(key)) {
            pairDexMap.set(key, new Set());
        }
        pairDexMap.get(key)!.add(pool.dex);
    }

    return pools.filter(pool => {
        const key = getPoolPairKey(pool);
        return (pairDexMap.get(key)?.size ?? 0) >= 2;
    });
}

// Global service declarations (uninitialized)
let provider: JsonRpcProvider;
let signer: Wallet;
let poolCache: PoolCache;
let stateCache: PoolStateCache;
let poolLoader: PoolLoader;
let subgraphPoolLoader: SubgraphPoolLoader;
let rpcPoolLoader: RpcPoolLoader;
let uniStateLoader: UniswapPoolStateLoader;
let aeroStateLoader: AerodromePoolStateLoader;
let poolStateLoader: PoolStateLoader;
let scheduler: PoolStateScheduler | undefined;
let priceOracle: PriceOracle;
let quoteEngine: QuoteEngine;
let scanner: OptimizedMarketPairScanner;
let triangularScanner: TriangularArbitrageScanner;
let blockEventScanner: BlockEventScanner;
let scanningTokens: string[] = [];
let excludedTopTokens: Set<string> = new Set();
let adapterRegistry: AdapterRegistry;
let engine: any;
let hybridAggregator: HybridAggregator | null = null;
let flashLoanExecutor: FlashLoanExecutor;
let opportunityFilter: OpportunityFilter;
let opportunityRepository: OpportunityRepository;
let circuitBreaker: CircuitBreaker;
let wsProvider: WebSocketProvider | null = null;
let httpProvider: JsonRpcProvider | null = null;
let marketPairs: { tokenA: string; tokenB: string; name: string }[] = [];

let running = true;
let loopCount = 0;

// Execution quality tracking for Slipstream impact analysis
let executionQualityMetrics = {
    totalScans: 0,
    totalCandidates: 0,
    executionSuccessRate: 0,
    avgSlippageActual: 0,
    avgSlippageExpected: 0
};

async function main() {
    console.log("🚀 Morpho Arbitrage Bot - Mainnet");
    console.log("===================================\n");

    // Load environment variables
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const BASE_RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL;
    const WS_RPC_URL = process.env.WS_RPC_URL;

    if (!PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set in environment");
    }
    if (!BASE_RPC_URL) {
        throw new Error("BASE_RPC_URL not set in environment");
    }

    // Initialize providers
    httpProvider = new JsonRpcProvider(BASE_RPC_URL);
    if (WS_RPC_URL && ENABLE_EVENT_BASED_SCANNING) {
        try {
            wsProvider = new WebSocketProvider(WS_RPC_URL);
            await wsProvider._start();
            console.log("✅ WebSocket provider initialized for event-based scanning");
        } catch (error) {
            console.log("⚠️ WebSocket provider failed, falling back to HTTP polling");
            wsProvider = null;
        }
    }

    provider = wsProvider || httpProvider;
    signer = new Wallet(PRIVATE_KEY, provider);

    console.log(`✅ Provider initialized: ${wsProvider ? "WebSocket" : "HTTP"}`);
    console.log(`✅ Signer: ${signer.address}\n`);

    // Initialize cache and rate limiting
    poolCache = new PoolCache();
    stateCache = new PoolStateCache();
    const quoteCache = getQuoteCache();

    // Initialize multi-RPC manager if enabled
    if (ENABLE_MULTI_RPC) {
        const multiRPCManager = getMultiRPCManager();
        console.log("✅ Multi-RPC manager initialized");
    }

    // Initialize hybrid pool loaders (Subgraph for Uniswap, RPC for others)
    subgraphPoolLoader = new SubgraphPoolLoader(poolCache);
    const factoryProvider = new JsonRpcProvider(BASE_RPC_URL);
    
    // Get active universe tokens for RPC pool loaders
    const activeUniverseTokens = getActiveUniverse().tokens;
    console.log(`🔧 Using ${activeUniverseTokens.length} tokens from ${getActiveUniverse().name}`);
    
    rpcPoolLoader = new RpcPoolLoader(factoryProvider, poolCache, activeUniverseTokens);
    console.log("✅ Hybrid pool loaders initialized (Subgraph + RPC)");

    // Initialize state loaders
    uniStateLoader = new UniswapPoolStateLoader(stateCache, provider);
    aeroStateLoader = new AerodromePoolStateLoader(stateCache, provider);
    poolStateLoader = new PoolStateLoader([uniStateLoader, aeroStateLoader]);

    // Initialize state scheduler if enabled
    if (!SKIP_POOL_STATE_REFRESH) {
        scheduler = new PoolStateScheduler(poolStateLoader, 30000); // 30s refresh
        await scheduler.start();
        console.log("✅ Pool state scheduler started");
    }

    // Load pools via hybrid approach (Subgraph for Uniswap, RPC for others)
    console.log("Loading pools via hybrid approach (Subgraph + RPC)...");

    try {
        // Load Uniswap pools via Subgraph (reliable, established pools)
        if (process.env.UNISWAP_SUBGRAPH_URL) {
            await subgraphPoolLoader.loadUniswap(process.env.UNISWAP_SUBGRAPH_URL!, 50);
            console.log("✅ Uniswap pools loaded via Subgraph");
        }

        // Load SushiSwap pools via RPC (subgraph unreliable on Base)
        if (process.env.SUSHISWAP_FACTORY_ADDRESS && process.env.BASE_RPC_URL) {
            const sushiSwapHttpProvider = new JsonRpcProvider(process.env.BASE_RPC_URL);
            const sushiSwapRpcLoader = new RpcPoolLoader(sushiSwapHttpProvider, poolCache, activeUniverseTokens);
            await sushiSwapRpcLoader.loadPoolsFromFactory(
                process.env.SUSHISWAP_FACTORY_ADDRESS,
                "SUSHISWAP",
                30 // Max 30 pools
            );
            console.log("✅ SushiSwap pools via RPC");
        }

        // Load PancakeSwap pools via RPC (subgraph unreliable on Base)
        if (process.env.PANCAKESWAP_FACTORY_ADDRESS && process.env.BASE_RPC_URL) {
            const pancakeswapHttpProvider = new JsonRpcProvider(process.env.BASE_RPC_URL);
            const pancakeswapRpcLoader = new RpcPoolLoader(pancakeswapHttpProvider, poolCache, activeUniverseTokens);
            await pancakeswapRpcLoader.loadPoolsFromFactory(
                process.env.PANCAKESWAP_FACTORY_ADDRESS,
                "PANCAKESWAP",
                30 // Max 30 pools
            );
            console.log("✅ PancakeSwap pools via RPC");
        }

        // Load Aerodrome pools via Subgraph (reliable)
        if (process.env.AERODROME_SUBGRAPH_URL) {
            await subgraphPoolLoader.loadAerodrome(process.env.AERODROME_SUBGRAPH_URL!, 50);
            console.log("✅ Aerodrome pools loaded via Subgraph");
        }
    } catch (error) {
        console.log("⚠️ Failed to load pools via RPC:", error);
    }

    // Limit pools
    const allPools = poolCache.getAll();
    // Skip multi-DEX filter for triangle discovery to allow more opportunities
    const limitedPools = allPools.slice(0, MAX_POOLS);

    poolCache.clear();
    for (const pool of limitedPools) {
        poolCache.add(pool);
    }

    function logPairDexCoverage(pairName: string, tokenA: string, tokenB: string) {
        // Disabled for cleaner logs
    }

    // Initialize DEX providers for cross-DEX triangle discovery
    const dexProviders: DexQuoteProvider[] = [];
    
    // Uniswap V3 provider
    if (process.env.UNISWAP_QUOTER_ADDRESS && process.env.UNISWAP_FACTORY_ADDRESS) {
        const uniswapProvider = new UniswapV3DexProvider(
            provider,
            poolCache,
            process.env.UNISWAP_QUOTER_ADDRESS,
            process.env.UNISWAP_FACTORY_ADDRESS
        );
        dexProviders.push(uniswapProvider);
        console.log("✅ UniswapV3 DEX provider initialized");
    }
    
    // SushiSwap provider - ENABLED with WebSocket RPC for quotes
    if (process.env.SUSHISWAP_QUOTER_ADDRESS && process.env.SUSHISWAP_WS_RPC_URL && process.env.SUSHISWAP_FACTORY_ADDRESS) {
        const sushiSwapWsProvider = createWebSocketProvider(process.env.SUSHISWAP_WS_RPC_URL);
        const sushiSwapProvider = new SushiSwapDexProvider(
            sushiSwapWsProvider,
            poolCache,
            process.env.SUSHISWAP_QUOTER_ADDRESS,
            process.env.SUSHISWAP_FACTORY_ADDRESS
        );
        dexProviders.push(sushiSwapProvider);
        console.log("✅ SushiSwap DEX provider initialized with WebSocket for quotes");
    }
    
    // PancakeSwap provider - ENABLED with WebSocket RPC for quotes
    if (process.env.PANCAKESWAP_QUOTER_ADDRESS && process.env.PANCAKESWAP_WS_RPC_URL && process.env.PANCAKESWAP_FACTORY_ADDRESS) {
        const pancakeswapWsProvider = createWebSocketProvider(process.env.PANCAKESWAP_WS_RPC_URL);
        const pancakeswapProvider = new PancakeSwapDexProvider(
            pancakeswapWsProvider,
            poolCache,
            process.env.PANCAKESWAP_QUOTER_ADDRESS,
            process.env.PANCAKESWAP_FACTORY_ADDRESS
        );
        dexProviders.push(pancakeswapProvider);
        console.log("✅ PancakeSwap DEX provider initialized with WebSocket for quotes");
    }
    
    // Aerodrome provider - ENABLED with subgraph for pool discovery
    if (process.env.AERODROME_QUOTER_ADDRESS && process.env.AERODROME_FACTORY_ADDRESS) {
        const aerodromeProvider = new AerodromeDexProvider(
            provider,
            poolCache,
            process.env.AERODROME_QUOTER_ADDRESS,
            process.env.AERODROME_FACTORY_ADDRESS
        );
        dexProviders.push(aerodromeProvider);
        console.log("✅ Aerodrome DEX provider initialized with subgraph for pool discovery");
    }
    
    // Initialize hybrid aggregator (0x primary, 1inch fallback) - DISABLED for now
    // Only initialize if 0x API credentials are provided
    let zeroXAggregator: ZeroXAggregator | null = null;
    if (process.env.ZEROX_API_KEY && process.env.ZEROX_API_URL) {
        const VALID_TAKER = "0x5E2F886b10a49685317De61f521b0Cfa59579d60"; // Your signer address for 0x API
        zeroXAggregator = new ZeroXAggregator(
            process.env.ZEROX_API_KEY,
            process.env.ZEROX_API_URL,
            8453, // Base chain ID
            VALID_TAKER
        );
        console.log("✅ 0x aggregator initialized");
    } else {
        console.log("ℹ️  0x aggregator disabled (no API credentials)");
    }
    
    // Initialize quote engine with adapted DEX providers
    const adaptedProviders = dexProviders.map(p => new DexProviderAdapter(p));
    quoteEngine = new QuoteEngine(adaptedProviders);
    
    // Initialize separate quote engine for discovery (DEX providers ONLY - no 0x)
    const discoveryQuoteEngine = new QuoteEngine(adaptedProviders);
    
    // Initialize triangular arbitrage scanner with DEX providers for discovery
    triangularScanner = new TriangularArbitrageScanner(quoteEngine, poolCache, dexProviders, zeroXAggregator, provider, discoveryQuoteEngine);

    // Initialize discrepancy discovery engine for two-phase discovery
    let discrepancyEngine: DiscrepancyDiscoveryEngine | null = null;
    if (dexProviders.length >= 2) {
        discrepancyEngine = new DiscrepancyDiscoveryEngine(
            dexProviders,
            poolCache,
            0.002 // 0.2% minimum spread
        );
        console.log("✅ Discrepancy discovery engine initialized");
    }
    
    // Load pools for triangle discovery using hybrid approach (Subgraph + RPC)
    if (dexProviders.length >= 2) {
        console.log("Building token graph from hybrid-loaded pools...");

        try {
            // Build token graph from pool cache (works with both subgraph and RPC pools)
            const allPools = poolCache.getAll();
            const tokenGraph = new Map<string, Map<string, string[]>>();

            for (const pool of allPools) {
                const token0 = pool.token0.toLowerCase();
                const token1 = pool.token1.toLowerCase();
                const dex = pool.dex;

                if (!tokenGraph.has(token0)) {
                    tokenGraph.set(token0, new Map());
                }
                if (!tokenGraph.has(token1)) {
                    tokenGraph.set(token1, new Map());
                }

                const token0DexMap = tokenGraph.get(token0)!;
                if (!token0DexMap.has(token1)) {
                    token0DexMap.set(token1, []);
                }
                token0DexMap.get(token1)!.push(dex);

                const token1DexMap = tokenGraph.get(token1)!;
                if (!token1DexMap.has(token0)) {
                    token1DexMap.set(token0, []);
                }
                token1DexMap.get(token0)!.push(dex);
            }

            // Build DEX edges for discovery engine
            const dexEdges: Map<string, Map<string, string[]>> = new Map();
            for (const [tokenA, tokenMap] of tokenGraph) {
                for (const [tokenB, dexes] of tokenMap) {
                    for (const dex of dexes) {
                        if (!dexEdges.has(dex)) {
                            dexEdges.set(dex, new Map());
                        }
                        const dexMap = dexEdges.get(dex)!;
                        if (!dexMap.has(tokenA)) {
                            dexMap.set(tokenA, []);
                        }
                        if (!dexMap.get(tokenA)!.includes(tokenB)) {
                            dexMap.get(tokenA)!.push(tokenB);
                        }
                    }
                }
            }

            triangularScanner.setDexEdges(dexEdges);

            // Generate simple triangles from token graph
            const triangles: [string, string, string][] = [];
            const USDC = TOKENS.USDC.toLowerCase();
            const WETH = TOKENS.WETH.toLowerCase();

            for (const [bridgeToken, tokenMap] of tokenGraph) {
                if (bridgeToken === USDC || bridgeToken === WETH) continue;

                const hasUSDC = tokenMap.has(USDC);
                const hasWETH = tokenMap.has(WETH);

                if (hasUSDC && hasWETH) {
                    triangles.push([USDC, bridgeToken, WETH]);
                }
            }

            if (triangles.length > 0) {
                const triangleRoutes: any[] = triangles.map((triangle) => ({
                    tokenA: triangle[0],
                    tokenB: triangle[1],
                    tokenC: triangle[2],
                    routeName: `${triangle[0].slice(0,6)} → ${triangle[1].slice(0,6)} → ${triangle[2].slice(0,6)}`
                }));

                triangularScanner.setRoutes(triangleRoutes);
                console.log(`✅ Loaded ${triangles.length} triangular routes for discovery`);
            } else {
                console.log("⚠️ No triangles generated from whitelist - no fallback routes available");
                console.log("⚠️ Either update whitelist with tokens that have bridge pools, or disable whitelist");
            }
        } catch (error) {
            console.log("⚠️ Triangle discovery failed, using fallback routes:", error);
        }
    } else {
        console.log("⚠️ Not enough DEX providers for triangle discovery, using fallback routes");
    }

    let oneInchAggregator: OneInchAggregator | null = null;
    if (process.env.INCH_API_KEY && process.env.INCH_API_BASE_URL) {
        oneInchAggregator = new OneInchAggregator(
            process.env.INCH_API_KEY,
            process.env.INCH_API_BASE_URL
        );
        
        const isHealthy = await oneInchAggregator.checkHealth();
        if (!isHealthy) {
            oneInchAggregator = null;
        }
    }
    
    // Check 0x API health and create hybrid aggregator - DISABLED for now
    let hybridAggregator: HybridAggregator | null = null;
    if (zeroXAggregator) {
        const zeroXHealthy = await zeroXAggregator.checkHealth();
        
        // Create hybrid aggregator only if 0x is healthy
        if (zeroXHealthy || oneInchAggregator) {
            hybridAggregator = new HybridAggregator(zeroXAggregator, oneInchAggregator!);
            const hybridProvider = new HybridAggregatorProvider(hybridAggregator);
            quoteEngine.registerProvider(hybridProvider);
            console.log("✅ Hybrid aggregator registered (with 0x)");
        } else {
            console.log("ℹ️  0x API unhealthy, skipping hybrid aggregator");
        }
    } else {
        console.log("ℹ️  0x aggregator disabled, skipping hybrid aggregator");
    }

    const WETH = process.env.WETH_ADDRESS!;
    const USDC = process.env.USDC_ADDRESS!;

    priceOracle = new PriceOracle(
        provider,
        quoteEngine,
        poolCache,
        WETH,
        USDC
    );

    // Use optimized scanner with advanced RPC reduction
    scanner = new OptimizedMarketPairScanner(
        quoteEngine,
        priceOracle,
        {
            topNForwardQuotes: TOP_N_FORWARD_QUOTES,
            minLiquidityETH: MIN_LIQUIDITY_ETH,
            enableQuoteCache: ENABLE_CACHING,
            quoteCacheTTL: 30000, // Increased from 3000ms to 30000ms
            maxPriceImpact: MAX_PRICE_IMPACT
        },
        poolCache
    );

    // Define market pairs to scan (fallback if triangle discovery fails)
    marketPairs = [
        // Temporarily disabled to focus on triangular arbitrage discovery
        // { tokenA: TOKENS.USDC, tokenB: TOKENS.WETH, name: "USDC/WETH" },
        // { tokenA: TOKENS.USDC, tokenB: TOKENS.AERO, name: "USDC/AERO" },
        // { tokenA: TOKENS.WETH, tokenB: TOKENS.AERO, name: "WETH/AERO" },
        // { tokenA: TOKENS.USDC, tokenB: TOKENS.VIRTUAL, name: "USDC/VIRTUAL" }
    ];

    // Initialize block event scanner (optional)
    if (ENABLE_EVENT_BASED_SCANNING && wsProvider) {
        blockEventScanner = new BlockEventScanner(
            provider,
            poolCache,
            poolStateLoader,
            SCAN_INTERVAL_MS
        );
        await blockEventScanner.start();
        console.log("✅ Block event scanner started");
    }

    // Initialize opportunity filter
    const filterConfig: FilterConfig = {
        minNetProfitUSD: 1.0,           // Minimum $1 net profit for more opportunities
        maxGasRatio: 0.5,               // Gas max 50% of gross profit
        minROI: 0.005,                  // Minimum 0.5% ROI (reduced from 1%)
        minLoanUSD: 100.0               // Minimum $100 loan size
    };

    opportunityFilter = new OpportunityFilter(filterConfig);
    opportunityRepository = new OpportunityRepository();

    // Circuit breaker configuration for mainnet safety
    const circuitBreakerConfig: CircuitBreakerConfig = {
        maxConsecutiveFailures: 3,           // Open after 3 consecutive failures
        resetTimeoutMs: 300000,              // Reset after 5 minutes
        maxFailureRate: 0.5,                 // Open if >50% failures in window
        failureWindowMs: 600000               // 10 minute window
    };

    circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

    // Initialize flash loan executor
    flashLoanExecutor = new FlashLoanExecutor(
        signer,
        poolCache,
        quoteEngine,
        priceOracle,
        TEST_AMOUNTS
    );

    // Initialize adapter registry
    adapterRegistry = new AdapterRegistry(
        process.env.UNISWAP_ADAPTER_V2_ADDRESS || "",
        process.env.SUSHISWAP_ADAPTER_V2_ADDRESS || "",
        process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS || "",
        process.env.AERODROME_ADAPTER_V2_ADDRESS || ""
    );

    // Main scanning loop
    console.log("Starting main scanning loop...\n");

    while (running) {
        loopCount++;
        const startTime = Date.now();

        try {
            // Check circuit breaker
            if (circuitBreaker.isOpen()) {
                console.log("⚠️ Circuit breaker is open, skipping scan");
                await sleep(SCAN_INTERVAL_MS);
                continue;
            }

            // Scan for opportunities using market pairs
            let opportunities: any[] = [];
            
            for (const pair of marketPairs) {
                try {
                    const pairOpps = await scanner.scan(pair.tokenA, pair.tokenB);
                    opportunities.push(...pairOpps);
                } catch (error) {
                    console.log(`⚠️ Scan error for ${pair.name}: ${error instanceof Error ? error.message : error}`);
                }
            }

            if (opportunities.length > 0) {
                console.log(`🎯 Found ${opportunities.length} opportunities in loop ${loopCount}`);

                for (const opp of opportunities) {
                    // Apply opportunity filter
                    if (!opportunityFilter.filter(opp)) {
                        continue;
                    }

                    // Execute safety checks
                    const safetyCheck = await evaluateExecutionSafety(opp, TEST_AMOUNTS);
                    if (!safetyCheck.safe) {
                        console.log(`⚠️ Safety check failed: ${safetyCheck.reason}`);
                        continue;
                    }

                    // Execute flash loan
                    try {
                        const result = await flashLoanExecutor.executeFlashLoan(opp);
                        
                        if (result.success) {
                            console.log(`✅ Flash loan executed successfully: ${result.netProfitUSD.toFixed(2)} USD`);
                            circuitBreaker.recordSuccess();
                        } else {
                            console.log(`❌ Flash loan execution failed: ${result.error}`);
                            circuitBreaker.recordFailure();
                        }
                    } catch (error) {
                        console.log(`❌ Flash loan execution error: ${error instanceof Error ? error.message : error}`);
                        circuitBreaker.recordFailure();
                    }
                }
            }

            // Scan triangular arbitrage using two-phase discovery
            console.log(`[MAIN SCAN] Starting two-phase discovery scan`);
            let triangularOpps: any[] = [];

            if (discrepancyEngine) {
                try {
                    // Phase A: Discover discrepancies
                    // Get available tokens from pool cache
                    const allPools = poolCache.getAll();
                    const uniqueTokens = new Set<string>();
                    for (const pool of allPools) {
                        uniqueTokens.add(pool.token0.toLowerCase());
                        uniqueTokens.add(pool.token1.toLowerCase());
                    }

                    const tokenArray = Array.from(uniqueTokens);
                    console.log(`[MAIN SCAN] Available tokens for discrepancy discovery: ${tokenArray.length}`);

                    // Phase A1: Generate anchor pairs (WETH ↔ kandidat)
                    const anchorPairs: { tokenA: string; tokenB: string }[] = [];
                    const maxAnchorPairs = 20;
                    let anchorPairCount = 0;

                    // Generate anchor pairs for BOTH USDC and WETH
                    for (let i = 0; i < tokenArray.length && anchorPairCount < maxAnchorPairs; i++) {
                        const token = tokenArray[i];
                        // Skip if token is one of the anchors
                        if (token.toLowerCase() === TOKENS.USDC.toLowerCase() || 
                            token.toLowerCase() === TOKENS.WETH.toLowerCase()) {
                            continue;
                        }
                        // Create pairs with both anchors
                        anchorPairs.push({ tokenA: TOKENS.USDC, tokenB: token });
                        anchorPairCount++;
                        if (anchorPairCount < maxAnchorPairs) {
                            anchorPairs.push({ tokenA: TOKENS.WETH, tokenB: token });
                            anchorPairCount++;
                        }
                    }

                    console.log(`[MAIN SCAN] Phase A1: Generated ${anchorPairs.length} anchor pairs (USDC + WETH ↔ kandidat)`);

                    // Phase A2: Generate cross-pairs (A↔B, A↔C, B↔C among kandidat)
                    const candidateTokens = tokenArray.filter(t => t.toLowerCase() !== TOKENS.USDC.toLowerCase() && t.toLowerCase() !== TOKENS.WETH.toLowerCase());
                    const crossPairs: { tokenA: string; tokenB: string }[] = [];
                    const maxCrossPairs = 30;
                    let crossPairCount = 0;

                    for (let i = 0; i < candidateTokens.length && crossPairCount < maxCrossPairs; i++) {
                        for (let j = i + 1; j < candidateTokens.length && crossPairCount < maxCrossPairs; j++) {
                            crossPairs.push({ tokenA: candidateTokens[i], tokenB: candidateTokens[j] });
                            crossPairCount++;
                        }
                    }

                    console.log(`[MAIN SCAN] Phase A2: Generated ${crossPairs.length} cross-pairs (A↔B, A↔C, B↔C)`);

                    // Combine all pairs for discovery
                    const allTokenPairs = [...anchorPairs, ...crossPairs];
                    console.log(`[MAIN SCAN] Total pairs for discovery: ${allTokenPairs.length}`);

                    // Phase A: Collect all executable bidirectional edges
                    const { edges, discrepancies } = await discrepancyEngine.collectExecutableEdges(
                        allTokenPairs,
                        TEST_AMOUNTS // Use multiple USD amounts for comprehensive discovery
                    );

                    // Phase B: Form triangles from executable edges
                    // Run with BOTH anchors (USDC and WETH) for better coverage
                    // Use USDC amount for both (will be converted dynamically during quote)
                    const trianglesFromUSDC = await discrepancyEngine.formTrianglesFromEdges(
                        edges,
                        TOKENS.USDC,
                        TEST_AMOUNTS[0]
                    );

                    const trianglesFromWETH = await discrepancyEngine.formTrianglesFromEdges(
                        edges,
                        TOKENS.WETH,
                        TEST_AMOUNTS[0]
                    );

                    // Combine triangles from both anchors
                    const triangles = [...trianglesFromUSDC, ...trianglesFromWETH];
                    console.log(`[MAIN SCAN] Total triangles from both anchors: ${triangles.length} (USDC: ${trianglesFromUSDC.length}, WETH: ${trianglesFromWETH.length})`);

                    // Convert TriangleCandidate to TriangularOpportunity format
                    triangularOpps = triangles.map(triangle => ({
                        route: {
                            tokenA: triangle.tokenA,
                            tokenB: triangle.tokenB,
                            tokenC: triangle.tokenC,
                            routeName: triangle.routeName
                        },
                        quotes: triangle.legs.map(leg => ({
                            dex: leg.dex,
                            pool: leg.dexProvider ? (leg.dexProvider as any).quoter?.target || "" : "",
                            tokenIn: leg.from,
                            tokenOut: leg.to,
                            amountIn: leg.amountIn,
                            amountOut: leg.amountOut
                        })),
                        inputAmount: triangle.inputAmount,
                        outputAmount: triangle.outputAmount,
                        profit: triangle.rawProfit,
                        profitPercentage: triangle.rawProfitPercentage,
                        steps: triangle.legs.map(leg => ({
                            from: leg.from,
                            to: leg.to,
                            amountIn: leg.amountIn,
                            amountOut: leg.amountOut,
                            dex: leg.dex
                        })),
                        qualityMetrics: triangle.qualityMetrics
                    }));

                    console.log(`[MAIN SCAN] Two-phase discovery found ${triangularOpps.length} opportunities`);
                } catch (error) {
                    console.log(`[MAIN SCAN] Two-phase discovery failed, falling back to traditional scan: ${error instanceof Error ? error.message : error}`);
                    triangularOpps = await triangularScanner.scanTriangularOpportunities(0.001);
                }
            } else {
                // Fallback to traditional scan
                triangularOpps = await triangularScanner.scanTriangularOpportunities(0.001);
            }

            console.log(`[MAIN SCAN] Total opportunities: ${triangularOpps.length}`);

            if (triangularOpps.length > 0) {
                console.log(`🎯 Found ${triangularOpps.length} triangular opportunities in loop ${loopCount}`);
                
                for (const opp of triangularOpps) {
                    console.log(`  ${opp.route.routeName}: ${opp.profitPercentage.toFixed(2)}% profit`);
                    
                    // Apply opportunity filter
                    if (!opportunityFilter.filter(opp)) {
                        console.log(`  ⚠️ Opportunity filtered out`);
                        continue;
                    }

                    // Validate with 0x only for profitable opportunities - DISABLED for now
                    // const zeroXValid = await triangularScanner.validateWithZeroX(opp);
                    // if (!zeroXValid) {
                    //     console.log(`  ⚠️ 0x validation failed, skipping execution`);
                    //     continue;
                    // }
                    console.log(`  ℹ️  0x validation disabled, skipping`);

                    // Execute safety checks
                    const safetyCheck = await evaluateExecutionSafety(opp, TEST_AMOUNTS);
                    if (!safetyCheck.safe) {
                        console.log(`  ⚠️ Safety check failed: ${safetyCheck.reason}`);
                        continue;
                    }

                    // Execute flash loan for triangular arbitrage
                    try {
                        const result = await flashLoanExecutor.executeFlashLoan(opp);
                        
                        if (result.success) {
                            console.log(`  ✅ Triangular flash loan executed successfully: ${result.netProfitUSD.toFixed(2)} USD`);
                            circuitBreaker.recordSuccess();
                        } else {
                            console.log(`  ❌ Triangular flash loan execution failed: ${result.error}`);
                            circuitBreaker.recordFailure();
                        }
                    } catch (error) {
                        console.log(`  ❌ Triangular flash loan execution error: ${error instanceof Error ? error.message : error}`);
                        circuitBreaker.recordFailure();
                    }
                }
            }

        } catch (error) {
            console.log(`❌ Scan error in loop ${loopCount}: ${error instanceof Error ? error.message : error}`);
            circuitBreaker.recordFailure();
        }

        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, SCAN_INTERVAL_MS - elapsed);
        
        if (waitTime > 0) {
            await sleep(waitTime);
        }
    }

    // Cleanup
    if (scheduler) {
        await scheduler.stop();
    }
    
    if (blockEventScanner) {
        await blockEventScanner.stop();
    }

    if (wsProvider) {
        await wsProvider.destroy();
    }

    console.log("Bot stopped");
}

// Handle graceful shutdown
process.on("SIGINT", () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    running = false;
});

process.on("SIGTERM", () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    running = false;
});

main().catch(console.error);
