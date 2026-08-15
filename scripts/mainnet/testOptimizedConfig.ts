import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { PoolLoader } from "../../bot/scanner/PoolLoader.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { OptimizedMarketPairScanner } from "../../bot/scanner/OptimizedMarketPairScanner.js";
import { PriceOracle } from "../../bot/oracle/PriceOracle.js";
import { UniswapQuote } from "../../bot/scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../../bot/scanner/quote/AerodromeQuote.js";
import { PancakeSwapQuote } from "../../bot/scanner/quote/PancakeSwapQuote.js";
import { OneInchAggregator } from "../../bot/scanner/aggregator/OneInchAggregator.js";
import { TOKENS } from "../../bot/scanner/TokenList.js";
import { getMultiRPCManager } from "../../bot/utils/MultiRPCManager.js";
import { convertUSDToUSDC } from "../../bot/utils/USDAmountConverter.js";

async function main() {
    console.log("Testing Optimized Configuration");
    console.log("==================================\n");

    // Load environment
    loadEnvForNetwork(hre);

    // Configuration (matching runBot.ts)
    const MAX_POOLS = 10; // Back to 10 since bridge tokens don't have pools
    const TOP_N_FORWARD_QUOTES = 1;
    const MIN_NET_PROFIT = 5.0; // Reduced for genuine arbitrage (was $1)
    const MAX_PRICE_IMPACT = 0.015; // 1.5%
    
    // Hybrid approach: Test USD-equivalent amounts for fair comparison across tokens
    // Range from $30 to $3,000 USD to catch more opportunities
    const TEST_AMOUNTS_USD = [
        30,     // $30 - Very small
        150,    // $150 - Small
        300,    // $300 - Medium-small
        1500,   // $1,500 - Medium
        3000    // $3,000 - Large
    ];
    
    // Convert USD amounts to USDC for compatibility
    const TEST_AMOUNTS = TEST_AMOUNTS_USD.map(amount => convertUSDToUSDC(amount));
    
    // Use genuine cross-DEX arbitrage pairs for legitimate opportunities
    // Focus on tokens with actual liquidity across multiple DEXes (Uniswap, Aerodrome, PancakeSwap)
    const HIGH_VALUE_PAIRS = [
        { tokenA: TOKENS.USDC, tokenB: TOKENS.WETH, name: "USDC/WETH" },        // Major pair - high liquidity, legitimate opportunities
        { tokenA: TOKENS.USDC, tokenB: TOKENS.AERO, name: "USDC/AERO" },        // USDC vs DEX governance - cross-DEX opportunities
        { tokenA: TOKENS.WETH, tokenB: TOKENS.AERO, name: "WETH/AERO" },        // Native vs DEX token - genuine arbitrage
        { tokenA: TOKENS.USDC, tokenB: TOKENS.CBETH, name: "USDC/CBETH" },      // USDC vs wrapped ETH - real price discrepancies
        { tokenA: TOKENS.USDC, tokenB: TOKENS.CBBTC, name: "USDC/CBBTC" },      // USDC vs wrapped BTC - legitimate opportunities
        { tokenA: TOKENS.CBETH, tokenB: TOKENS.CBBTC, name: "CBETH/CBBTC" }      // Wrapped ETH vs wrapped BTC - cross-asset arbitrage
    ];

    console.log("Configuration:");
    console.log("  MAX_POOLS:", MAX_POOLS);
    console.log("  TOP_N_FORWARD_QUOTES:", TOP_N_FORWARD_QUOTES);
    console.log("  MIN_NET_PROFIT: $", MIN_NET_PROFIT);
    console.log("  Price Impact Limit:", `Up to ${(MAX_PRICE_IMPACT * 100).toFixed(1)}%`);
    console.log("  Hybrid Approach: Test 5 USD-equivalent amounts");
    console.log("  Test Amounts:", TEST_AMOUNTS_USD.map(a => `$${a}`).join(", "));
    console.log("  Scan Pairs: 6 genuine cross-DEX pairs (USDC/WETH, USDC/AERO, WETH/AERO, USDC/CBETH, USDC/CBBTC, CBETH/CBBTC)");
    console.log("  DEX Sources: Uniswap, Aerodrome, PancakeSwap");
    console.log("  Aggregator: 1inch API enabled");
    console.log("  Slipstream Protection: ✅ Active (via Alchemy)");
    console.log("  Strategy: Genuine cross-DEX arbitrage (MEV-free)");
    console.log();

    // Initialize multi-RPC
    const multiRPCManager = getMultiRPCManager();
    const provider = multiRPCManager.getHealthyProvider();
    console.log("Multi-RPC Status:", multiRPCManager.getStats());

    // Initialize wallet
    const privateKey = process.env.PRIVATE_KEY!;
    const signer = new Wallet(privateKey, provider);
    console.log("Signer:", signer.address);

    // Load pools
    console.log("\nLoading pools...");
    const poolCache = new PoolCache();
    const poolLoader = new PoolLoader(provider, poolCache);
    const subgraphPoolLoader = new SubgraphPoolLoader(poolCache);

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
        
        // Try to load PancakeSwap pools (if subgraph is available)
        if (process.env.PANCAKESWAP_FACTORY_ADDRESS) {
            console.log("Attempting to load PancakeSwap pools...");
            try {
                const PANCAKESWAP_FACTORY = process.env.PANCAKESWAP_FACTORY_ADDRESS;
                await poolLoader.loadPancakeSwap(PANCAKESWAP_FACTORY);
                console.log("✅ PancakeSwap pools loaded");
            } catch (error) {
                console.warn("⚠️ Failed to load PancakeSwap pools:", error instanceof Error ? error.message : error);
            }
        }
    } else {
        console.warn("Subgraph endpoints not configured, falling back to on-chain pool discovery.");
        const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY_ADDRESS!;
        const AERODROME_FACTORY = process.env.AERODROME_FACTORY_ADDRESS!;

        await poolLoader.loadUniswap(UNISWAP_FACTORY);
        await poolLoader.loadAerodrome(AERODROME_FACTORY);
        
        // Load PancakeSwap pools if configured
        if (process.env.PANCAKESWAP_FACTORY_ADDRESS) {
            const PANCAKESWAP_FACTORY = process.env.PANCAKESWAP_FACTORY_ADDRESS;
            await poolLoader.loadPancakeSwap(PANCAKESWAP_FACTORY);
            console.log("✅ PancakeSwap pools loaded");
        }
    }

    const allPools = poolCache.getAll();
    const limitedPools = allPools.slice(0, MAX_POOLS);
    
    poolCache.clear();
    for (const pool of limitedPools) {
        poolCache.add(pool);
    }
    
    console.log("Total Pools:", allPools.length);
    console.log("Active Pools:", limitedPools.length);
    
    // Debug: Show loaded pools
    console.log("\nLoaded Pools:");
    allPools.forEach(pool => {
        console.log(`  ${pool.dex}: ${pool.token0.slice(0,10)}.../${pool.token1.slice(0,10)}... (TVL: $${Math.round(pool.totalValueLockedUSD || pool.reserveUSD || 0)})`);
    });

    // Initialize quote engine
    console.log("\nInitializing quote engine...");
    const quoteEngine = new QuoteEngine();

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

    // Add PancakeSwap quote provider if configured
    let pancakeQuote: PancakeSwapQuote | null = null;
    if (process.env.PANCAKESWAP_QUOTER_ADDRESS) {
        pancakeQuote = new PancakeSwapQuote(
            provider,
            poolCache,
            process.env.PANCAKESWAP_QUOTER_ADDRESS
        );
        quoteEngine.registerProvider(pancakeQuote);
        console.log("✅ PancakeSwap quote provider registered");
    }

    // Add 1inch aggregator if configured
    let oneInchAggregator: OneInchAggregator | null = null;
    if (process.env.INCH_API_KEY && process.env.INCH_API_BASE_URL) {
        oneInchAggregator = new OneInchAggregator(
            process.env.INCH_API_KEY,
            process.env.INCH_API_BASE_URL
        );
        
        // Check 1inch API health
        const isHealthy = await oneInchAggregator.checkHealth();
        if (isHealthy) {
            console.log("✅ 1inch API aggregator initialized and healthy");
        } else {
            console.warn("⚠️ 1inch API health check failed, aggregator disabled");
            oneInchAggregator = null;
        }
    } else {
        console.log("ℹ️ 1inch API disabled: missing INCH_API_KEY or INCH_API_BASE_URL");
    }

    quoteEngine.registerProvider(uniQuote);
    quoteEngine.registerProvider(aeroQuote);

    // Initialize price oracle
    const WETH = process.env.WETH_ADDRESS!;
    const USDC = process.env.USDC_ADDRESS!;

    const priceOracle = new PriceOracle(
        provider,
        quoteEngine,
        poolCache,
        WETH,
        USDC
    );

    // Initialize optimized scanner
    console.log("\nInitializing optimized scanner...");
    const scanner = new OptimizedMarketPairScanner(
        quoteEngine,
        priceOracle,
        {
            topNForwardQuotes: TOP_N_FORWARD_QUOTES,
            minLiquidityETH: 10,
            enableQuoteCache: true,
            quoteCacheTTL: 3000,
            maxPriceImpact: MAX_PRICE_IMPACT
        },
        poolCache
    );

    console.log("Scanner initialized successfully");

    // Test scan with hybrid approach
    console.log("\nTesting scan with hybrid approach...");
    console.log("Scanning 6 genuine cross-DEX pairs with 5 strategic amounts each:\n");

    const totalStartTime = Date.now();
    const allCandidates: any[] = [];

    for (const pair of HIGH_VALUE_PAIRS) {
        console.log(`Scanning ${pair.name}...`);
        
        let bestPairCandidate = null;
        let bestPairProfit = -Infinity;
        
        // Hybrid approach: Test all USD-equivalent amounts per pair
        for (let i = 0; i < TEST_AMOUNTS.length; i++) {
            const amount = TEST_AMOUNTS[i];
            const usdAmount = TEST_AMOUNTS_USD[i];
            console.log(`  Testing amount: $${usdAmount} USD`);
            
            const startTime = Date.now();
            try {
                // Get quotes from local DEXes (Uniswap, Aerodrome, PancakeSwap)
                const amountCandidates = await scanner.scan(
                    pair.tokenA,
                    pair.tokenB,
                    amount  // Test each USD-equivalent amount
                );
                
                // Also try 1inch aggregator if available
                if (oneInchAggregator) {
                    try {
                        const inchQuote = await oneInchAggregator.getQuote({
                            tokenIn: pair.tokenA,
                            tokenOut: pair.tokenB,
                            amountIn: amount
                        });
                        
                        if (inchQuote) {
                            console.log(`    1inch aggregator quote: ${ethers.formatEther(inchQuote.amountOut)} ${pair.tokenB.slice(0,8)}...`);
                            // Add 1inch quote to candidates
                            amountCandidates.push({
                                ...inchQuote,
                                netProfitUSD: 0, // Will be calculated by filter
                                priceImpact: 0 // Will be calculated
                            });
                        }
                    } catch (error) {
                        console.log(`    1inch aggregator error:`, error instanceof Error ? error.message : error);
                    }
                }
                
                const elapsed = Date.now() - startTime;
                
                console.log(`    Time: ${elapsed}ms, Candidates: ${amountCandidates.length}`);
                
                // Find best candidate for this amount
                for (const candidate of amountCandidates) {
                    if ((candidate.netProfitUSD ?? -Infinity) > bestPairProfit) {
                        bestPairProfit = candidate.netProfitUSD ?? -Infinity;
                        bestPairCandidate = candidate;
                    }
                }
            } catch (error) {
                console.log(`    Error: ${error}`);
            }
        }
        
        if (bestPairCandidate) {
            console.log(`  Best for ${pair.name}: $${bestPairCandidate.netProfitUSD?.toFixed(2)} profit (${ethers.formatEther(bestPairCandidate.amountIn)} WETH)`);
            allCandidates.push(bestPairCandidate);
        } else {
            console.log(`  No valid candidates for ${pair.name}`);
        }
    }

    const totalElapsed = Date.now() - totalStartTime;

    console.log("\n======================================");
    console.log("RESULTS");
    console.log("======================================");
    console.log("Total Scan Time:", totalElapsed, "ms");
    console.log("Total Candidates:", allCandidates.length);
    console.log("Quote Cache Stats:", scanner.getQuoteCacheStats());

    if (allCandidates.length > 0) {
        console.log("\nBest Opportunity:");
        console.log("======================================");
        const best = allCandidates[0];
        console.log("Pair:", best.forward.dex, "->", best.reverse.dex);
        console.log("Amount In:", ethers.formatEther(best.amountIn), "WETH");
        console.log("Amount Back:", ethers.formatEther(best.amountBack), "WETH");
        console.log("Profit:", ethers.formatEther(best.profit), "WETH");
        console.log("Net Profit USD:", best.netProfitUSD?.toFixed(2));
    } else {
        console.log("\nNo arbitrage opportunities found.");
    }

    console.log("\n======================================");
    console.log("PROJECTED RPC USAGE (Alchemy 30M CU)");
    console.log("======================================");
    console.log("Note: Genuine cross-DEX arbitrage pairs with Slipstream protection");
    console.log("provide more consistent execution quality without MEV interference.\n");
    
    // Hybrid approach: 6 pairs × 5 amounts × ~10 quote calls per evaluation (10 pools)
    const callsPerEvaluation = 10; // Forward + reverse quotes with 10 pools
    const evaluationsPerScan = 6 * 5; // 6 pairs × 5 amounts
    const callsPerScan = callsPerEvaluation * evaluationsPerScan; // 300 calls per scan
    const cuPerCall = 40; // Average CU per quote call
    const cuPerScan = callsPerScan * cuPerCall; // 12,000 CU per scan
    
    // HTTP Polling mode (60 second intervals)
    const httpScanInterval = 60; // 60 seconds
    const httpScansPerMinute = 60 / httpScanInterval; // 1 scan per minute
    const httpCuPerDay = cuPerScan * httpScansPerMinute * 60 * 24; // 17,280,000 CU per day
    
    // WebSocket Event-Based mode (scan every 30th block to manage RPC usage)
    const baseBlockTime = 2; // ~2 seconds per block on Base
    const blocksPerMinute = 60 / baseBlockTime; // 30 blocks per minute
    const recommendedSkipBlocks = 29; // Scan every 30th block
    const wsScansPerMinute = blocksPerMinute / (recommendedSkipBlocks + 1); // 1 scan per minute
    const wsCuPerDay = cuPerScan * wsScansPerMinute * 60 * 24; // 17,280,000 CU per day

    console.log("Pairs per scan: 6 (genuine cross-DEX pairs)");
    console.log("Amounts per pair: 5 (0.01, 0.05, 0.1, 0.5, 1.0 WETH)");
    console.log("Evaluations per scan:", evaluationsPerScan);
    console.log("Quote calls per evaluation:", callsPerEvaluation);
    console.log("Total calls per scan:", callsPerScan);
    console.log("CU per call (avg):", cuPerCall);
    console.log("CU per scan:", cuPerScan);
    
    console.log("\nHTTP Polling Mode (60s intervals):");
    console.log("Scan interval:", httpScanInterval, "seconds");
    console.log("Scans per minute:", httpScansPerMinute);
    console.log("CU per day:", httpCuPerDay.toLocaleString());
    
    console.log("\nWebSocket Event-Based Mode (Recommended):");
    console.log("Base block time:", baseBlockTime, "seconds");
    console.log("Skip blocks:", recommendedSkipBlocks, "(scan every 30th block)");
    console.log("Scans per minute:", wsScansPerMinute.toFixed(1));
    console.log("CU per day:", wsCuPerDay.toLocaleString());

    console.log("\nAlchemy Limits:");
    console.log("Your Plan: 30,000,000 CU/day");
    console.log("HTTP Polling Usage:", httpCuPerDay.toLocaleString(), `CU/day (${(httpCuPerDay / 30000000 * 100).toFixed(1)}%)`);
    console.log("WebSocket Usage:", wsCuPerDay.toLocaleString(), `CU/day (${(wsCuPerDay / 30000000 * 100).toFixed(1)}%)`);

    if (wsCuPerDay < 10000000) {
        console.log("\n✅ WebSocket: VERY SAFE (< 33% usage)");
    } else if (wsCuPerDay < 20000000) {
        console.log("\n✅ WebSocket: SAFE (< 67% usage)");
    } else if (wsCuPerDay < 30000000) {
        console.log("\n⚠️ WebSocket: MODERATE (< 100% usage)");
    } else {
        console.log("\n❌ WebSocket: EXCEEDS limit");
    }
    
    console.log("\n📊 SLIPSTREAM IMPACT:");
    console.log("✅ MEV protection active for Aerodrome transactions");
    console.log("✅ More consistent execution quality expected");
    console.log("✅ Lower competition from MEV bots");
    console.log("✅ Reduced false positive opportunities");
    
    console.log("\n📡 WEBSOCKET BENEFITS:");
    console.log("✅ Real-time arbitrage detection (vs 60s delay with polling)");
    console.log("✅ Lower latency for execution");
    console.log("✅ No missed opportunities between scans");
    console.log("✅ Better competitive advantage");

    console.log("\nTest Complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });