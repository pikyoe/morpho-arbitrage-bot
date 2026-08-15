import { setTimeout as sleep } from "timers/promises";
import { JsonRpcProvider, Provider, Wallet, WebSocketProvider, ethers as ethersLib, formatUnits, parseUnits } from "ethers";
import { TOKENS, TOKEN_DECIMALS } from "../../bot/scanner/TokenList.js";
import { getActiveUniverse } from "../../bot/scanner/TokenUniverse.js";
import { convertUSDToUSDC, convertUSDToTokenAmount, getTokenPriceUSD } from "../../bot/utils/USDAmountConverter.js";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { getMultiRPCManager } from "../../bot/utils/MultiRPCManager.js";
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
import hre from "hardhat";

// Caching and rate limiting configuration
const ENABLE_CACHING = true;
const ENABLE_RATE_LIMITING = true;
const ENABLE_EVENT_BASED_SCANNING = true; // Set to true for WebSocket-based scanning
const SCAN_INTERVAL_MS = 60000; // 60 seconds for production to prevent API rate limits
const MAX_POOLS = 200; // Increased from 20 to allow more triangle discovery
const SKIP_POOL_STATE_REFRESH = true; // Skip pool state refresh to reduce eth_calls (scheduler has compatibility issues)
const TOP_N_FORWARD_QUOTES = 1; // Reduced to 1 for maximum RPC reduction
const MIN_LIQUIDITY_ETH = 5; // Skip pools with liquidity below threshold
const MAX_PRICE_IMPACT = 0.015; // Maximum acceptable price impact fraction (1.5%)
const MIN_NET_PROFIT_USD = 1; // Reduced from 5 to 1 for more opportunities
const MIN_GROSS_PROFIT_USD = 5; // Reduced from 10 to 5 for more opportunities
const EXECUTION_GAS_RESERVE_USD = Number(process.env.EXECUTION_GAS_RESERVE_USD || 0.5);
const DRY_RUN = process.env.RUNBOT_DRY_RUN === "true";
const ENABLE_MULTI_RPC = true;
const MAX_LOAN_USD = 10000; // Cap exposure per trade
const MAX_QUOTE_AGE_MS = 10000; // Reject stale quotes older than 10s

// Single test amount for discovery (just to find discrepancies)
// Use USDC amount for consistent pricing across all pairs
// Optimal amount will be determined during execution by findOptimalAmount
const TEST_AMOUNTS_USD = [500]; // $500 USD for discovery

// Convert USD to USDC amount for discovery
const TEST_AMOUNTS = TEST_AMOUNTS_USD.map(amount => convertUSDToUSDC(amount));
const SWAP_STEP_TUPLE = "(address adapter,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 minAmountOut,bytes data,uint256 deadline)";
const ROUTE_TUPLE = `(${SWAP_STEP_TUPLE}[] swaps,address profitToken,uint256 minProfit)`;
const EXECUTE_ARBITRAGE_ABI = [
    `function executeArbitrage(address token,uint256 amount,${ROUTE_TUPLE} route)`,
    `function validateRoute(${ROUTE_TUPLE} route,address token) view returns (bool)`,
    "function approvedAdapter(address) view returns (bool)"
];

function getPoolPairKey(pool: PoolInfo): string {
    const tokens = [pool.token0.toLowerCase(), pool.token1.toLowerCase()];
    tokens.sort();
    return `${tokens[0]}-${tokens[1]}`;
}

function rawTokenAmountToUsd(amount: bigint, token: string): number {
    const decimals = TOKEN_DECIMALS[token.toLowerCase()] || 18;
    return Number(formatUnits(amount, decimals)) * getTokenPriceUSD(token);
}

function enrichTriangleOpportunity(opp: any): any {
    const token = String(opp.route?.tokenA || opp.steps?.[0]?.from || TOKENS.USDC);
    const inputAmount = BigInt(opp.inputAmount ?? opp.steps?.[0]?.amountIn ?? 0);
    const rawProfit = BigInt(opp.profit ?? (BigInt(opp.outputAmount ?? 0) - inputAmount));
    const loanAmountUSD = rawTokenAmountToUsd(inputAmount, token);
    const grossProfitUSD = rawTokenAmountToUsd(rawProfit > 0n ? rawProfit : 0n, token);
    const netProfitUSD = grossProfitUSD - EXECUTION_GAS_RESERVE_USD;
    const quoteTimestamp = Number(opp.quoteTimestamp ?? Date.now());
    return {
        ...opp,
        loanAmountUSD,
        grossProfitUSD,
        netProfitUSD,
        gasRatio: grossProfitUSD > 0 ? EXECUTION_GAS_RESERVE_USD / grossProfitUSD : Infinity,
        quoteTimestamp,
        quoteAgeMs: Math.max(0, Date.now() - quoteTimestamp),
        gasCostUSD: EXECUTION_GAS_RESERVE_USD,
        flashLoanFeeUSD: 0
    };
}

async function refreshTriangleOpportunity(opp: any): Promise<any | null> {
    if (!Array.isArray(opp.steps) || opp.steps.some((s: any) => !s.provider)) return null;
    let amount = BigInt(opp.inputAmount);
    const refreshedSteps: any[] = [];
    for (const step of opp.steps) {
        const quote = await step.provider.quote({ tokenIn: step.from, tokenOut: step.to, amountIn: amount });
        if (!quote || quote.amountOut <= 0n) return null;
        refreshedSteps.push({
            ...step,
            // ArbitrageEngineV2 uses currentAmount when amountIn is zero.
            // Only the flash-loan leg should be pinned to a fixed amount;
            // later legs must consume the previous leg's actual output.
            amountIn: refreshedSteps.length === 0 ? amount : 0n,
            amountOut: quote.amountOut,
            minAmountOut: (quote.amountOut * 9950n) / 10000n
        });
        amount = quote.amountOut;
    }
    const refreshed = {
        ...opp,
        steps: refreshedSteps,
        outputAmount: amount,
        profit: amount - BigInt(opp.inputAmount),
        quoteTimestamp: Date.now()
    };
    return enrichTriangleOpportunity(refreshed);
}

async function applyDynamicGasCost(opp: any): Promise<any> {
    try {
        const gasPrice = await priceOracle.getGasPrice();
        const ethPriceUSD = await priceOracle.getEthPriceUSD();
        // Estimate the actual route. A fixed gas limit can materially
        // understate costs for multi-hop routes and create false positives.
        const gasLimit = await flashLoanExecutor.estimateOpportunityGas(opp, opp.profitToken);
        const gasCostUSD = Number(gasPrice * gasLimit) / 1e18 * ethPriceUSD;
        const gross = opp.grossProfitUSD;
        return {
            ...opp,
            netProfitUSD: gross - gasCostUSD,
            gasCostUSD,
            gasLimit: gasLimit.toString(),
            gasRatio: gross > 0 ? gasCostUSD / gross : Infinity
        };
    } catch {
        // Do not execute on an unpriced route. Returning -Infinity lets the
        // normal opportunity/safety filters reject it without a transaction.
        return {
            ...opp,
            netProfitUSD: Number.NEGATIVE_INFINITY,
            gasCostUSD: Number.POSITIVE_INFINITY,
            gasRatio: Number.POSITIVE_INFINITY,
            gasEstimationFailed: true
        };
    }
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
let provider: Provider;
let signer: Wallet;
let poolCache: PoolCache;
let stateCache: PoolStateCache;
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

    // Initialize HTTP providers. Use both configured RPC endpoints through a
    // fallback provider instead of sending every request to BASE_RPC_URL only.
    const rpcUrls = [...new Set([
        process.env.BASE_RPC_URL_1 || BASE_RPC_URL,
        process.env.BASE_RPC_URL_2
    ].filter((url): url is string => Boolean(url)))];
    const rpcProviders = rpcUrls.map(url => new JsonRpcProvider(url));
    httpProvider = rpcProviders[0];
    const httpFallbackProvider = rpcProviders.length > 1
        ? new ethersLib.FallbackProvider(rpcProviders.map((rpc, index) => ({
            provider: rpc,
            priority: index + 1,
            stallTimeout: 1500,
            weight: 1
        })))
        : httpProvider;
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

    // WebSocket is reserved for event subscriptions; all HTTP reads, quotes,
    // gas estimation and execution use the configured fallback RPC set.
    provider = httpFallbackProvider;
    signer = new Wallet(PRIVATE_KEY, provider);
    console.log(`HTTP RPC endpoints active: ${rpcUrls.join(", ")}`);

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
    const factoryProvider: Provider = httpFallbackProvider;
    
    // Get active universe tokens for RPC pool loaders
    const activeUniverseTokens = getActiveUniverse().tokens;
    console.log(`🔧 Using ${activeUniverseTokens.length} tokens from ${getActiveUniverse().name}`);
    
    rpcPoolLoader = new RpcPoolLoader(factoryProvider, poolCache, activeUniverseTokens);
    console.log("✅ Hybrid pool loaders initialized (Subgraph + RPC)");

    // Initialize state loaders
    uniStateLoader = new UniswapPoolStateLoader(provider, poolCache, stateCache);
    aeroStateLoader = new AerodromePoolStateLoader(provider, poolCache, stateCache);
    poolStateLoader = new PoolStateLoader([uniStateLoader, aeroStateLoader]);

    // Initialize state scheduler if enabled
    if (!SKIP_POOL_STATE_REFRESH) {
        scheduler = new PoolStateScheduler(poolStateLoader, { intervalMs: 30000 }); // 30s refresh
        scheduler.start();
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
    const limitedPools = allPools
        .slice()
        .sort((a, b) => {
            const liquidityA = a.totalValueLockedUSD ?? a.reserveUSD ?? 0;
            const liquidityB = b.totalValueLockedUSD ?? b.reserveUSD ?? 0;
            return liquidityB - liquidityA;
        })
        .slice(0, MAX_POOLS);

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
    const aerodromeRouter = process.env.AERODROME_ROUTER_ADDRESS || process.env.AERODROME_ROUTER;
    if (aerodromeRouter && process.env.AERODROME_FACTORY_ADDRESS) {
        const aerodromeProvider = new AerodromeDexProvider(
            provider,
            poolCache,
            aerodromeRouter,
            process.env.AERODROME_FACTORY_ADDRESS
        );
        dexProviders.push(aerodromeProvider);
        console.log("✅ Aerodrome DEX provider initialized with subgraph for pool discovery");
    }
    
    // Discovery must only use DEXes that have a deployed, engine-approved
    // adapter. A quote from a DEX without an adapter can never be executed
    // safely and would otherwise create false opportunities.
    const adapterEnvByDex: Record<string, string | undefined> = {
        UniswapV3: process.env.UNISWAP_ADAPTER_V2_ADDRESS,
        SushiSwap: process.env.SUSHISWAP_ADAPTER_V2_ADDRESS,
        PancakeSwap: process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS,
        Aerodrome: process.env.AERODROME_ADAPTER_V2_ADDRESS
    };
    for (let i = dexProviders.length - 1; i >= 0; i--) {
        const dexName = dexProviders[i].getDexName();
        const adapterAddress = adapterEnvByDex[dexName];
        if (!adapterAddress || !ethersLib.isAddress(adapterAddress) || adapterAddress === ethersLib.ZeroAddress) {
            console.warn(`DEX provider disabled: ${dexName} has no valid adapter address`);
            dexProviders.splice(i, 1);
        }
    }
    if (dexProviders.length < 2) {
        throw new Error("At least two DEX providers with valid deployed adapters are required");
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
    triangularScanner = new TriangularArbitrageScanner(quoteEngine, poolCache, dexProviders, zeroXAggregator ?? undefined, provider, discoveryQuoteEngine);

    // Initialize discrepancy discovery engine for two-phase discovery
    let discrepancyEngine: DiscrepancyDiscoveryEngine | null = null;
    if (dexProviders.length >= 2) {
        discrepancyEngine = new DiscrepancyDiscoveryEngine(
            dexProviders,
            poolCache,
            0.002, // 0.2% minimum spread
            provider
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
            const dexEdges: Map<string, Map<string, Set<string>>> = new Map();
            for (const [tokenA, tokenMap] of tokenGraph) {
                for (const [tokenB, dexes] of tokenMap) {
                    for (const dex of dexes) {
                        if (!dexEdges.has(dex)) {
                            dexEdges.set(dex, new Map());
                        }
                        const dexMap = dexEdges.get(dex)!;
                        if (!dexMap.has(tokenA)) {
                            dexMap.set(tokenA, new Set<string>());
                        }
                        if (!dexMap.get(tokenA)!.has(tokenB)) {
                            dexMap.get(tokenA)!.add(tokenB);
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
            scanner,
            {
                enabled: true,
                skipBlocks: 0,
                // Refresh pool state on each block so the polling loop always
                // sees fresh quotes.
                onBlock: async () => {
                    try {
                        await poolStateLoader.refresh();
                    } catch (error) {
                        console.log(`⚠️ Block-triggered pool state refresh failed: ${error instanceof Error ? error.message : error}`);
                    }
                }
            }
        );
        // start() requires a token pair; results are handled by onBlock above.
        await blockEventScanner.start(TOKENS.USDC, TOKENS.WETH);
        console.log("✅ Block event scanner started");
    }

    // Initialize opportunity filter
    const filterConfig: FilterConfig = {
        minNetProfitUSD: MIN_NET_PROFIT_USD,
        minGrossProfitUSD: MIN_GROSS_PROFIT_USD,
        maxGasRatio: 0.5,               // Gas max 50% of gross profit
        minROI: 0.005,                  // Minimum 0.5% ROI (reduced from 1%)
        minLoanUSD: 100.0
    };

    opportunityFilter = new OpportunityFilter(filterConfig);
    opportunityRepository = new OpportunityRepository();

    // Circuit breaker configuration for mainnet safety
    const circuitBreakerConfig: CircuitBreakerConfig = {
        maxConsecutiveFailures: 3,           // Open after 3 consecutive failures
        cooldownPeriod: 300000,              // 5 minutes before attempting to close
        maxGasPriceGwei: 50,                 // Block if gas > 50 gwei
        maxTxsPerMinute: 10,                 // Rate limit: 10 tx/min
        minBalanceETH: 0.1                   // Minimum 0.1 ETH balance
    };

    circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

    // Initialize adapter registry
    adapterRegistry = new AdapterRegistry(
        process.env.UNISWAP_ADAPTER_V2_ADDRESS || "",
        process.env.SUSHISWAP_ADAPTER_V2_ADDRESS || "",
        process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS || "",
        process.env.AERODROME_ADAPTER_V2_ADDRESS || ""
    );

    // Initialize the V2 executor with the deployed engine contract. The old
    // runBot constructor signature was incompatible with FlashLoanExecutor.
    const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
    if (!engineAddress) {
        throw new Error("ARBITRAGE_ENGINE_V2_ADDRESS not set; refusing to run execution loop");
    }
    engine = new ethersLib.Contract(engineAddress, EXECUTE_ARBITRAGE_ABI, signer);
    flashLoanExecutor = new FlashLoanExecutor(engine, adapterRegistry);

    // Confirm every adapter used for discovery is approved by the deployed
    // engine before scanning. This avoids discovering routes that can never
    // pass on-chain validation.
    for (const dex of dexProviders) {
        const adapterAddress = adapterRegistry.get(dex.getDexName());
        if (!await engine.approvedAdapter(adapterAddress)) {
            throw new Error(`Adapter ${adapterAddress} for ${dex.getDexName()} is not approved by the engine`);
        }
    }

    // Main scanning loop
    console.log("Starting main scanning loop...\n");
    console.log(`Execution mode: ${DRY_RUN ? "DRY-RUN (no transactions)" : "LIVE"}`);

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
                    const safetyCheck = evaluateExecutionSafety({
                        grossProfitUSD: opp.grossProfitUSD,
                        netProfitUSD: opp.netProfitUSD,
                        loanAmountUSD: opp.loanAmountUSD,
                        quoteAgeMs: opp.quoteAgeMs,
                        maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
                        minNetProfitUSD: MIN_NET_PROFIT_USD,
                        minGrossProfitUSD: MIN_GROSS_PROFIT_USD,
                        maxLoanUSD: MAX_LOAN_USD
                    });
                    if (!safetyCheck.allowed) {
                        console.log(`⚠️ Safety check failed: ${safetyCheck.reason}`);
                        continue;
                    }

                    // Execute flash loan
                    try {
                        if (DRY_RUN) {
                            console.log("  🧪 Dry-run: route validated; transaction not submitted");
                            continue;
                        }
                        const result = await flashLoanExecutor.executeFlashLoan(opp);
                        
                        if (result.success) {
                            console.log(`✅ Flash loan executed successfully: ${(result.netProfitUSD ?? 0).toFixed(2)} USD`);
                            console.log(`  Profit event: ${result.profitVerified ? `${result.actualProfitRaw?.toString()} raw units` : "not found"}`);
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

                    let testAmountWETH: bigint;
                    try {
                        const ethPriceUSD = await priceOracle.getEthPriceUSD();
                        testAmountWETH = parseUnits(
                            (TEST_AMOUNTS_USD[0] / ethPriceUSD).toFixed(6),
                            18
                        );
                    } catch {
                        // Keep the static converter only as a sizing fallback.
                        testAmountWETH = convertUSDToTokenAmount(TEST_AMOUNTS_USD[0], TOKENS.WETH);
                    }
                    const trianglesFromWETH = await discrepancyEngine.formTrianglesFromEdges(
                        edges,
                        TOKENS.WETH,
                        testAmountWETH
                    );

                    // Combine triangles from both anchors
                    const triangles = [...trianglesFromUSDC, ...trianglesFromWETH];
                    console.log(`[MAIN SCAN] Total triangles from both anchors: ${triangles.length} (USDC: ${trianglesFromUSDC.length}, WETH: ${trianglesFromWETH.length})`);

                    // Convert TriangleCandidate to TriangularOpportunity format
                    triangularOpps = triangles.map(triangle => enrichTriangleOpportunity({
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
                            fee: leg.fee,
                            stable: leg.stable,
                            factory: leg.factory,
                            amountIn: leg.amountIn,
                            amountOut: leg.amountOut
                        })),
                        inputAmount: triangle.inputAmount,
                        outputAmount: triangle.outputAmount,
                        profit: triangle.rawProfit,
                        profitToken: triangle.tokenA,
                        profitPercentage: triangle.rawProfitPercentage,
                        steps: triangle.legs.map((leg, index) => ({
                            from: leg.from,
                            to: leg.to,
                            amountIn: index === 0 ? leg.amountIn : 0n,
                            amountOut: leg.amountOut,
                            minAmountOut: (leg.amountOut * 9950n) / 10000n,
                            dex: leg.dex,
                            fee: leg.fee,
                            data: leg.dex.toUpperCase() === "AERODROME"
                                ? ethersLib.AbiCoder.defaultAbiCoder().encode(
                                    ["bool", "address"],
                                    [leg.stable ?? false, leg.factory ?? ethersLib.ZeroAddress]
                                )
                                : "0x"
                            , provider: leg.dexProvider
                        })),
                        qualityMetrics: triangle.qualityMetrics
                    }));

                    console.log(`[MAIN SCAN] Two-phase discovery found ${triangularOpps.length} opportunities`);
                } catch (error) {
                    console.log(`[MAIN SCAN] Two-phase discovery failed, falling back to traditional scan: ${error instanceof Error ? error.message : error}`);
                    triangularOpps = (await triangularScanner.scanTriangularOpportunities(0.001))
                        .map(enrichTriangleOpportunity);
                }
            } else {
                // Fallback to traditional scan
                triangularOpps = (await triangularScanner.scanTriangularOpportunities(0.001))
                    .map(enrichTriangleOpportunity);
            }

            console.log(`[MAIN SCAN] Total opportunities: ${triangularOpps.length}`);

            if (triangularOpps.length > 0) {
                console.log(`🎯 Found ${triangularOpps.length} triangular opportunities in loop ${loopCount}`);
                
                for (const candidate of triangularOpps) {
                    const refreshed = await refreshTriangleOpportunity(candidate);
                    const opp = refreshed ? await applyDynamicGasCost(refreshed) : null;
                    if (!opp) {
                        console.log("  ⚠️ Candidate invalidated by fresh quotes");
                        continue;
                    }
                    if (opp.gasEstimationFailed) {
                        console.log("  ⚠️ Gas estimation failed; skipping execution");
                        continue;
                    }
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
                    const safetyCheck = evaluateExecutionSafety({
                        grossProfitUSD: opp.grossProfitUSD,
                        netProfitUSD: opp.netProfitUSD,
                        loanAmountUSD: opp.loanAmountUSD,
                        quoteAgeMs: opp.quoteAgeMs,
                        maxQuoteAgeMs: MAX_QUOTE_AGE_MS,
                        minNetProfitUSD: MIN_NET_PROFIT_USD,
                        minGrossProfitUSD: MIN_GROSS_PROFIT_USD,
                        maxLoanUSD: MAX_LOAN_USD
                    });
                    if (!safetyCheck.allowed) {
                        console.log(`  ⚠️ Safety check failed: ${safetyCheck.reason}`);
                        continue;
                    }

                    try {
                        if (!await flashLoanExecutor.validateOpportunity(opp, opp.profitToken)) {
                            console.log("  âš ï¸ On-chain route validation failed");
                            continue;
                        }
                    } catch (error) {
                        console.log(`  âš ï¸ On-chain route validation error: ${error instanceof Error ? error.message : error}`);
                        continue;
                    }

                    // Execute flash loan for triangular arbitrage
                    try {
                        if (DRY_RUN) {
                            console.log("  🧪 Dry-run: triangular route validated; transaction not submitted");
                            continue;
                        }
                        const result = await flashLoanExecutor.executeFlashLoan(opp);
                        
                        if (result.success) {
                            console.log(`  ✅ Triangular flash loan executed successfully: ${(result.netProfitUSD ?? 0).toFixed(2)} USD`);
                            console.log(`  Profit event: ${result.profitVerified ? `${result.actualProfitRaw?.toString()} raw units` : "not found"}`);
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

