import hre from "hardhat";
import loadEnvForNetwork from "../utils/loadEnv.js";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { PoolLoader } from "../../bot/scanner/PoolLoader.js";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { OptimizedMarketPairScanner } from "../../bot/scanner/OptimizedMarketPairScanner.js";
import { PriceOracle } from "../../bot/oracle/PriceOracle.js";
import { UniswapQuote } from "../../bot/scanner/quote/UniswapQuote.js";
import { AerodromeQuote } from "../../bot/scanner/quote/AerodromeQuote.js";
import { TOKENS } from "../../bot/scanner/TokenList.js";
import { getMultiRPCManager } from "../../bot/utils/MultiRPCManager.js";

async function main() {
    console.log("Testing Optimized MarketPairScanner");
    console.log("======================================\n");

    // Load environment
    loadEnvForNetwork(hre);

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

    const UNISWAP_FACTORY = process.env.UNISWAP_FACTORY_ADDRESS!;
    const AERODROME_FACTORY = process.env.AERODROME_FACTORY_ADDRESS!;

    await poolLoader.loadUniswap(UNISWAP_FACTORY);
    await poolLoader.loadAerodrome(AERODROME_FACTORY);

    const allPools = poolCache.getAll();
    const limitedPools = allPools.slice(0, 10);
    
    console.log("Total Pools:", allPools.length);
    console.log("Active Pools:", limitedPools.length);

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
            topNForwardQuotes: 3,
            minLiquidityETH: 10,
            enableQuoteCache: true,
            quoteCacheTTL: 3000
        }
    );

    console.log("Scanner Config:");
    console.log("  Top-N Forward Quotes: 3");
    console.log("  Min Liquidity ETH: 10");
    console.log("  Quote Cache: Enabled (3s TTL)");

    // Test scan
    console.log("\nStarting scan test...");
    console.log("Scanning WETH -> USDC arbitrage opportunities...\n");

    const startTime = Date.now();
    const candidates = await scanner.scan(TOKENS.WETH, TOKENS.USDC);
    const scanTime = Date.now() - startTime;

    console.log("\nScan Results:");
    console.log("======================================");
    console.log("Scan Time:", scanTime, "ms");
    console.log("Candidates Found:", candidates.length);
    console.log("Quote Cache Stats:", scanner.getQuoteCacheStats());

    if (candidates.length > 0) {
        console.log("\nBest Opportunity:");
        console.log("======================================");
        const best = candidates[0];
        console.log("Forward DEX:", best.forward.dex);
        console.log("Reverse DEX:", best.reverse.dex);
        console.log("Amount In:", ethers.formatEther(best.amountIn), "WETH");
        console.log("Amount Back:", ethers.formatEther(best.amountBack), "WETH");
        console.log("Profit:", ethers.formatEther(best.profit), "WETH");
        console.log("Gross Profit USD:", best.grossProfitUSD?.toFixed(2));
        console.log("Net Profit USD:", best.netProfitUSD?.toFixed(2));
        console.log("Profitable:", best.profitable);
    } else {
        console.log("\nNo arbitrage opportunities found.");
    }

    // Test quote cache effectiveness
    console.log("\nTesting quote cache effectiveness...");
    console.log("Running second scan (should use cache)...\n");

    const startTime2 = Date.now();
    const candidates2 = await scanner.scan(TOKENS.WETH, TOKENS.USDC);
    const scanTime2 = Date.now() - startTime2;

    console.log("\nSecond Scan Results:");
    console.log("======================================");
    console.log("Scan Time:", scanTime2, "ms");
    console.log("Time Improvement:", ((scanTime - scanTime2) / scanTime * 100).toFixed(1), "%");
    console.log("Quote Cache Stats:", scanner.getQuoteCacheStats());

    console.log("\nTest Complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });