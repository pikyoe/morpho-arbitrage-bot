import { setTimeout as sleep } from "timers/promises";
import { JsonRpcProvider, Wallet, ethers as ethersLib } from "ethers";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { PoolLoader } from "../../bot/scanner/PoolLoader.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { PoolStateCache } from "../../bot/scanner/state/PoolStateCache.js";
import { UniswapPoolStateLoader } from "../../bot/scanner/state/UniswapPoolStateLoader.js";
import { AerodromePoolStateLoader } from "../../bot/scanner/state/AerodromePoolStateLoader.js";
import { PoolStateLoader } from "../../bot/scanner/state/PoolStateLoader.js";
import { PoolStateScheduler } from "../../bot/scanner/state/PoolStateScheduler.js";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { OptimizedMarketPairScanner } from "../../bot/scanner/OptimizedMarketPairScanner.js";
import { ParallelMarketScanner } from "../../bot/scanner/ParallelMarketScanner.js";
import { BlockEventScanner } from "../../bot/scanner/BlockEventScanner.js";
import { PriceOracle } from "../../bot/oracle/PriceOracle.js";
import { UniswapQuote } from "../../bot/scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../../bot/scanner/quote/AerodromeQuote.js";
import { AdapterRegistry } from "../../bot/registry/AdapterRegistry.js";
import { RouteBuilder } from "../../bot/RouteBuilder.js";
import { TOKENS } from "../../bot/scanner/TokenList.js";
import { PoolInfo } from "../../bot/scanner/PoolTypes.js";
import { FlashLoanExecutor } from "../../bot/executor/FlashLoanExecutor.js";
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
const ENABLE_EVENT_BASED_SCANNING = false; // Set to true for WebSocket-based scanning
const SCAN_INTERVAL_MS = 10000; // 10 seconds (reduced from 2 seconds to save RPC calls)
const MAX_POOLS = 50; // Limit to top 50 pools from subgraph
const SKIP_POOL_STATE_REFRESH = true; // Skip pool state refresh to reduce eth_calls
const TOP_N_FORWARD_QUOTES = 3; // Only quote reverse for top 3 forward quotes
const MIN_LIQUIDITY_ETH = 10; // Skip pools with liquidity below threshold
const MIN_PRICE_IMPACT = 0.01; // Minimum acceptable price impact fraction (1%)
const MAX_PRICE_IMPACT = 0.015; // Maximum acceptable price impact fraction (1.5%)

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
let uniStateLoader: UniswapPoolStateLoader;
let aeroStateLoader: AerodromePoolStateLoader;
let poolStateLoader: PoolStateLoader;
let scheduler: PoolStateScheduler | undefined;
let priceOracle: PriceOracle;
let quoteEngine: QuoteEngine;
let scanner: OptimizedMarketPairScanner;
let marketScanner: ParallelMarketScanner;
let blockEventScanner: BlockEventScanner;
let scanningTokens: string[] = [];
let excludedTopTokens: Set<string> = new Set();
let adapterRegistry: AdapterRegistry;
let engine: any;
let flashLoanExecutor: FlashLoanExecutor;
let opportunityFilter: OpportunityFilter;
let opportunityRepository: OpportunityRepository;
let circuitBreaker: CircuitBreaker;

let running = true;
let loopCount = 0;

async function initialize() {
    console.log("");

    console.log("==============================");

    console.log("BASE ARBITRAGE BOT");

    console.log("==============================");

    // Validate configuration before starting
    ConfigValidator.validateOrThrow();

    // Provider (with multi-RPC support)
    if (ENABLE_MULTI_RPC) {
        const multiRPCManager = getMultiRPCManager();
        provider = multiRPCManager.getHealthyProvider();
        console.log("Multi-RPC Manager initialized:", multiRPCManager.getStats());
    } else {
        provider = new JsonRpcProvider(
            process.env.BASE_RPC_URL!
        );
    }

    // Wallet / Signer
    signer = new Wallet(
        process.env.PRIVATE_KEY!,
        provider
    );

    // Cache
    poolCache = new PoolCache();
    stateCache = new PoolStateCache();

    // Pool loader
    poolLoader = new PoolLoader(
        provider,
        poolCache
    );
    subgraphPoolLoader = new SubgraphPoolLoader(poolCache);

    const UNISWAP_SUBGRAPH_URL = process.env.UNISWAP_SUBGRAPH_URL;
    const AERODROME_SUBGRAPH_URL = process.env.AERODROME_SUBGRAPH_URL;
    const SUBGRAPH_POOL_LIMIT = Number(process.env.SUBGRAPH_POOL_LIMIT || "50");

    if (UNISWAP_SUBGRAPH_URL && AERODROME_SUBGRAPH_URL) {
        console.log("Loading pools from subgraph endpoints...");
        await subgraphPoolLoader.loadUniswap(
            UNISWAP_SUBGRAPH_URL,
            SUBGRAPH_POOL_LIMIT
        );
        await subgraphPoolLoader.loadAerodrome(
            AERODROME_SUBGRAPH_URL,
            SUBGRAPH_POOL_LIMIT
        );
    } else {
        console.warn("Subgraph endpoints not configured, falling back to on-chain pool discovery.");
        const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY_ADDRESS!;
        const AERODROME_FACTORY = process.env.AERODROME_FACTORY_ADDRESS!;

        await poolLoader.loadUniswap(UNISWAP_FACTORY);
        await poolLoader.loadAerodrome(AERODROME_FACTORY);
    }

    const allPools = poolCache.getAll();
    const limitedPools = allPools.slice(0, MAX_POOLS);
    poolCache.clear();
    for (const pool of limitedPools) {
        poolCache.add(pool);
    }

    const loadedTokens = Array.from(
        new Set(
            poolCache
                .getAll()
                .flatMap(pool => [pool.token0, pool.token1])
        )
    );

    const blacklistTokens = [
        process.env.WETH_ADDRESS,
        process.env.USDC_ADDRESS,
        process.env.USDT_ADDRESS,
        process.env.DAI_ADDRESS,
        process.env.WBTC_ADDRESS,
        process.env.WBNB_ADDRESS,
        ...(process.env.EXCLUDED_TOP_TOKEN_ADDRESSES
            ? process.env.EXCLUDED_TOP_TOKEN_ADDRESSES.split(",").map(address => address.trim())
            : [])
    ].filter((address): address is string => !!address)
        .map(address => address.toLowerCase());

    excludedTopTokens = new Set(blacklistTokens);

    const scanningCandidates = loadedTokens.filter(token =>
        !excludedTopTokens.has(token.toLowerCase())
    );

    scanningTokens = scanningCandidates.length > 0
        ? scanningCandidates
        : Object.values(TOKENS).filter(
            (address): address is string => typeof address === "string" && address.length > 0
        );

    console.log("Total Pools Loaded:", allPools.length);
    console.log("Active Pools (Limited):", limitedPools.length);
    console.log("Unique tokens for scanning:", scanningTokens.length);
    console.log("Excluded top tokens:", Array.from(excludedTopTokens).length);

    // STEP 3 — State loaders (SKIPPED to reduce eth_calls)
    if (!SKIP_POOL_STATE_REFRESH) {
        uniStateLoader = new UniswapPoolStateLoader(
            provider,
            poolCache,
            stateCache
        );

        aeroStateLoader = new AerodromePoolStateLoader(
            provider,
            poolCache,
            stateCache
        );

        // STEP 4 — PoolStateLoader
        poolStateLoader = new PoolStateLoader([
            uniStateLoader,
            aeroStateLoader
        ]);

        // STEP 5 — Refresh first
        await poolStateLoader.refresh();

        console.log("State Cache:", stateCache.size());

        // STEP 6 — Scheduler
        scheduler = new PoolStateScheduler(
            poolStateLoader,
            {
                intervalMs: 10000,
                runImmediately: false
            }
        );

        scheduler.start();
    } else {
        console.log("Pool state refresh SKIPPED to reduce RPC calls");
    }

    // STEP 7 — Scanner
    quoteEngine = new QuoteEngine();

    const uniQuote = new UniswapQuote(
        provider,
        poolCache,
        process.env.UNISWAP_QUOTER_ADDRESS!
    );

    const aeroQuote = new AerodromeQuote(
        provider,
        poolCache,
        process.env.AERODROME_ROUTER!
    );

    quoteEngine.registerProvider(uniQuote);
    quoteEngine.registerProvider(aeroQuote);

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
            quoteCacheTTL: 3000,
            minPriceImpact: MIN_PRICE_IMPACT,
            maxPriceImpact: MAX_PRICE_IMPACT
        }
    );

    marketScanner = new ParallelMarketScanner(
        scanner,
        scanningTokens,
        5
    );

    console.log("Optimized Scanner Config:");
    console.log("  Top-N Forward Quotes:", TOP_N_FORWARD_QUOTES);
    console.log("  Min Liquidity ETH:", MIN_LIQUIDITY_ETH);
    console.log("  Price Impact Range:", `${(MIN_PRICE_IMPACT * 100).toFixed(2)}% - ${(MAX_PRICE_IMPACT * 100).toFixed(2)}%`);
    console.log("  Quote Cache:", ENABLE_CACHING ? "Enabled" : "Disabled");

    // Initialize block event scanner (optional)
    if (ENABLE_EVENT_BASED_SCANNING) {
        blockEventScanner = new BlockEventScanner(
            provider,
            scanner,
            {
                enabled: true,
                onBlock: async (blockNumber) => {
                    console.log(`Block event triggered scan: ${blockNumber}`);
                    await executeLoop();
                },
                onError: (error) => {
                    console.error("Block event scanner error:", error);
                }
            }
        );
        console.log("Block event scanner initialized");
    }

    // Adapter registry
    adapterRegistry = new AdapterRegistry(
        process.env.UNISWAP_ADAPTER_V2_ADDRESS!,
        process.env.AERODROME_ADAPTER_V2_ADDRESS!
    );

    const connection: any = await hre.network.connect();
    const { ethers } = connection;

    engine = await ethers.getContractAt(
        "ArbitrageEngineV2",
        process.env.ARBITRAGE_ENGINE_V2_ADDRESS!,
        signer
    );

    flashLoanExecutor = new FlashLoanExecutor(engine);

    // Flashbots removed — use public mempool executor only
    console.log("Flashbots integration removed; using public mempool executor (FlashLoanExecutor).\n");

    // Opportunity management
    const filterConfig: FilterConfig = {
        minNetProfitUSD: 5.0,           // Minimum $5 profit
        maxGasRatio: 0.5,               // Gas max 50% of gross profit
        minROI: 0.01,                   // Minimum 1% ROI
        minLoanUSD: 100.0               // Minimum $100 loan size
    };

    opportunityFilter = new OpportunityFilter(filterConfig);
    opportunityRepository = new OpportunityRepository();

    // Circuit breaker configuration for mainnet safety
    const circuitBreakerConfig: CircuitBreakerConfig = {
        maxConsecutiveFailures: 3,           // Open after 3 consecutive failures
        cooldownPeriod: 300_000,             // 5 minutes cooldown
        maxGasPriceGwei: 50,                 // Block if gas > 50 gwei
        maxTxsPerMinute: 10,                // Rate limit: 10 tx/min
        minBalanceETH: 0.1                   // Minimum 0.1 ETH balance
    };

    circuitBreaker = new CircuitBreaker(circuitBreakerConfig);

}

async function executeLoop() {
    loopCount++;

    console.log("");

    console.log("======================================");

    console.log(`LOOP #${loopCount}`);

    console.log("======================================");

    const started = Date.now();

    const candidates = await marketScanner.scanAll();

    const elapsed =
        Date.now() - started;

    console.log("");

    console.log(

        `Candidates : ${candidates.length}`

    );

    console.log(

        `Scan Time  : ${elapsed} ms`

    );

    if (candidates.length === 0) {

        console.log(

            "No arbitrage opportunity."

        );

        return;

    }

    // Clean up old opportunities
    opportunityRepository.cleanup();

    // Filter candidates using OpportunityFilter
    const filteredCandidates: any[] = [];

    for (const candidate of candidates) {
        // Check if already processed recently
        if (candidate.id && opportunityRepository.has(candidate.id)) {
            continue;
        }

        // Calculate loan amount in USD
        const loanAmountUSD = Number(ethersLib.formatEther(candidate.amountIn)) *
            (await priceOracle.getEthPriceUSD());

        // Apply filter
        const filterResult = opportunityFilter.filter({
            loanAmountUSD,
            grossProfitUSD: candidate.grossProfitUSD || 0,
            netProfitUSD: candidate.netProfitUSD || 0,
            gasRatio: candidate.gasCostUSD && candidate.grossProfitUSD ?
                candidate.gasCostUSD / candidate.grossProfitUSD : 1
        });

        if (filterResult.accepted) {
            filteredCandidates.push(candidate);
            opportunityRepository.save(candidate);
        } else {
            console.log(`Candidate rejected: ${filterResult.reason}`);
        }
    }

    if (filteredCandidates.length === 0) {

        console.log(

            "No opportunity passed safety filters."

        );

        return;

    }

    const best = filteredCandidates[0];

    // Log the best opportunity
    const gasPrice = await priceOracle.getGasPrice();
    const ethPrice = await priceOracle.getEthPriceUSD();
    OpportunityLogger.print(best, ethPrice, gasPrice);

    const route =
        RouteBuilder.build(

            best,

            adapterRegistry

        );

    console.log();

    console.log("Building Route...");

    console.log(

        "Swaps:",

        route.swaps.length

    );

    const valid =

        await engine.validateRoute(

            route,

            signer.address

        );

    console.log();

    console.log(

        "Route Validation:",

        valid

            ? "PASS"

            : "FAILED"

    );

    if (!valid) {

        console.log("Route validation failed.");

        return;

    }

    if (!best.profitable) {

        console.log("Not profitable.");

        return;

    }

    // Circuit breaker checks before execution
    console.log("Checking circuit breaker status...");

    if (circuitBreaker.isOpen()) {
        console.warn("⚠️ Circuit breaker is OPEN - skipping execution");
        console.log("Waiting for cooldown period...");
        return;
    }

    // Check rate limiting
    if (circuitBreaker.wouldExceedRateLimit()) {
        console.warn("⚠️ Rate limit would be exceeded - skipping execution");
        return;
    }

    // Check gas price
    const currentGasPrice = await priceOracle.getGasPrice();
    const currentGasPriceGwei = Number(ethersLib.formatUnits(currentGasPrice, "gwei"));

    if (circuitBreaker.isGasPriceTooHigh(currentGasPriceGwei)) {
        console.warn(`⚠️ Gas price too high (${currentGasPriceGwei} gwei) - skipping execution`);
        return;
    }

    // Check wallet balance
    const balance = await provider.getBalance(signer.address);
    const balanceETH = Number(ethersLib.formatEther(balance));

    if (balanceETH < 0.0003) { // Minimum balance check
        console.warn(`⚠️ Wallet balance too low (${balanceETH} ETH) - skipping execution`);
        return;
    }

    console.log();

    console.log(

        "READY TO EXECUTE"

    );

    console.log("");

    console.log("====================================");

    console.log("EXECUTING FLASH LOAN");

    console.log("====================================");

    try {
        // Execute via public mempool FlashLoanExecutor
        const receipt = await flashLoanExecutor.execute(
            TOKENS.WETH,
            best.amountIn,
            route
        );

        console.log("Transaction Success");
        console.log("Execution Method:", "PUBLIC");
        console.log("Tx Hash :", receipt.hash || receipt.transactionHash || "(unknown)");

        // Record success in circuit breaker
        circuitBreaker.recordSuccess();

        // Remove from repository after successful execution
        if (best.id) {
            opportunityRepository.remove(best.id);
        }
    } catch (error) {
        console.error("Flash loan execution failed:", error);

        // Record failure in circuit breaker
        circuitBreaker.recordFailure(error instanceof Error ? error.message : "Unknown error");

        // Keep in repository to avoid reprocessing same failed opportunity
        if (best.id) {
            console.log(`Marking opportunity ${best.id} as failed`);
        }

        // Continue to next loop instead of crashing
        return;
    }

    console.log("");

    console.log("BEST OPPORTUNITY");

    console.log("----------------------------");

    console.log(

        "ID:",

        best.id

    );

    console.log(

        "BUY:",

        best.forward.dex

    );

    console.log(

        "SELL:",

        best.reverse.dex

    );

    console.log(

        "Loan:",

        ethersLib.formatEther(

            best.amountIn

        ),

        "WETH"

    );

    console.log(

        "Gross Profit:",

        ethersLib.formatEther(

            best.profit

        ),

        "WETH"

    );

    console.log(

        "Net Profit:",

        best.netProfitUSD

    );

    console.log("");

    console.log("Loop Summary");

    console.log("----------------");

    console.log(

        "Total Candidates :",

        candidates.length

    );

    console.log(

        "Passed Filters :",

        filteredCandidates.length

    );

    console.log(

        "Loop Time :",

        elapsed,

        "ms"

    );

}

async function shutdown() {

    console.log("Stopping services...");

    scheduler?.stop();
    
    // Stop block event scanner if running
    if (blockEventScanner) {
        await blockEventScanner.stop();
    }

    running = false;

    // Log circuit breaker stats
    if (circuitBreaker) {
        console.log("Circuit Breaker Statistics:");
        console.log(JSON.stringify(circuitBreaker.getStats(), null, 2));
    }

    // Log quote cache stats
    if (scanner) {
        console.log("Quote Cache Statistics:");
        console.log(JSON.stringify(scanner.getQuoteCacheStats(), null, 2));
    }

    console.log("Bot stopped.");

}

// Error classification for better handling
function classifyError(error: any): string {
    const errorMessage = error?.message?.toLowerCase() || '';

    if (errorMessage.includes('nonce') || errorMessage.includes('replacement')) {
        return 'NONCE_ERROR';
    }
    if (errorMessage.includes('gas') || errorMessage.includes('exceeds')) {
        return 'GAS_ERROR';
    }
    if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        return 'NETWORK_ERROR';
    }
    if (errorMessage.includes('insufficient')) {
        return 'BALANCE_ERROR';
    }
    if (errorMessage.includes('slippage')) {
        return 'SLIPPAGE_ERROR';
    }
    return 'UNKNOWN_ERROR';
}

function getRetryDelay(errorType: string, attempt: number): number {
    const baseDelays: Record<string, number> = {
        'NONCE_ERROR': 2000,
        'GAS_ERROR': 5000,
        'NETWORK_ERROR': 3000,
        'BALANCE_ERROR': 0,      // Don't retry balance errors
        'SLIPPAGE_ERROR': 1000,
        'UNKNOWN_ERROR': 5000
    };

    const baseDelay = baseDelays[errorType] || 5000;
    return baseDelay * Math.pow(1.5, attempt); // Exponential backoff
}

process.on("SIGINT", async () => {

    console.log("");

    console.log("Stopping bot...");

    await shutdown();

});

process.on("SIGTERM", async () => {

    console.log("");

    console.log("Stopping bot...");

    await shutdown();

});

async function main() {

    await initialize();

    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    if (ENABLE_EVENT_BASED_SCANNING && blockEventScanner) {
        // Use event-based scanning
        console.log("Starting event-based scanning...");
        
        try {
            await blockEventScanner.start(TOKENS.WETH, TOKENS.USDC);
            
            // Keep the process alive
            while (running) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error("Event-based scanning error:", error);
            console.log("Falling back to interval-based scanning...");
            await blockEventScanner.stop();
            await runIntervalScanning(consecutiveErrors, maxConsecutiveErrors);
        }
    } else {
        // Use interval-based scanning
        await runIntervalScanning(consecutiveErrors, maxConsecutiveErrors);
    }
}

async function runIntervalScanning(consecutiveErrors: number, maxConsecutiveErrors: number) {
    while (running) {

        try {

            await executeLoop();

            consecutiveErrors = 0; // Reset error counter on success

        }

        catch (err) {

            consecutiveErrors++;

            const errorType = classifyError(err);
            console.error(`Error Type: ${errorType}`);
            console.error(`Consecutive Errors: ${consecutiveErrors}/${maxConsecutiveErrors}`);

            // Check if we should stop the bot
            if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error("Too many consecutive errors. Stopping bot.");
                await shutdown();
                process.exit(1);
            }

            // Calculate retry delay based on error type
            const retryDelay = getRetryDelay(errorType, consecutiveErrors);

            console.log(`Retrying in ${retryDelay}ms...`);

            await sleep(retryDelay);

            continue; // Skip the normal sleep
        }

        await sleep(SCAN_INTERVAL_MS); // Use configurable scan interval

    }

}

main().catch(console.error);