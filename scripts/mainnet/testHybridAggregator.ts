import { ZeroXAggregator } from "../../bot/scanner/aggregator/ZeroXAggregator.js";
import { OneInchAggregator } from "../../bot/scanner/aggregator/OneInchAggregator.js";
import { HybridAggregator } from "../../bot/scanner/aggregator/HybridAggregator.js";

async function testHybridAggregator() {
    console.log("Testing Hybrid Aggregator (QuickNode/0x Primary, 1inch Fallback)");
    console.log("==========================================================\n");

    const ZEROX_API_URL = process.env.ZEROX_API_URL || "https://api.0x.org/swap/permit2";
    const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";
    const INCH_API_KEY = process.env.INCH_API_KEY || "";
    const INCH_API_BASE_URL = process.env.INCH_API_BASE_URL || "";

    console.log("Configuration:");
    console.log("  0x API URL:", ZEROX_API_URL);
    console.log("  0x API Key:", ZEROX_API_KEY ? "Set" : "Not set");
    console.log("  1inch API Key:", INCH_API_KEY ? "Set" : "Not set");
    console.log("  1inch API URL:", INCH_API_BASE_URL);
    console.log();

    // Initialize aggregators (Base chain ID = 8453)
    // Use a valid address for QuickNode endpoint
    const VALID_TAKER = "0x5E2F886b10a49685317De61f521b0Cfa59579d60"; // Your signer address
    const zeroXAggregator = new ZeroXAggregator(ZEROX_API_KEY, ZEROX_API_URL, 8453, VALID_TAKER);
    const oneInchAggregator = INCH_API_KEY && INCH_API_BASE_URL 
        ? new OneInchAggregator(INCH_API_KEY, INCH_API_BASE_URL)
        : null;

    // Test individual aggregators
    console.log("Testing individual aggregators...\n");

    // Test 0x
    console.log("Testing 0x API:");
    const zeroXHealthy = await zeroXAggregator.checkHealth();
    console.log("  Health Check:", zeroXHealthy ? "✅ Healthy" : "❌ Unhealthy");
    
    if (zeroXHealthy) {
        try {
            const WETH = "0x4200000000000000000000000000000000000006";
            const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
            const amount = BigInt("1000000000000000000"); // 1 WETH

            const zeroXQuote = await zeroXAggregator.getQuote({
                tokenIn: WETH,
                tokenOut: USDC,
                amountIn: amount
            });

            if (zeroXQuote) {
                console.log("  ✅ Quote received:", zeroXQuote.amountOut.toString(), "USDC");
                console.log("  DEX:", zeroXQuote.dex);
                console.log("  Pool:", zeroXQuote.pool);
            } else {
                console.log("  ❌ No quote received");
            }
        } catch (error) {
            console.log("  ❌ Quote error:", error instanceof Error ? error.message : error);
        }
    }
    console.log();

    // Test 1inch
    if (oneInchAggregator) {
        console.log("Testing 1inch API:");
        const oneInchHealthy = await oneInchAggregator.checkHealth();
        console.log("  Health Check:", oneInchHealthy ? "✅ Healthy" : "❌ Unhealthy");
        
        if (oneInchHealthy) {
            try {
                const WETH = "0x4200000000000000000000000000000000000006";
                const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
                const amount = BigInt("1000000000000000000"); // 1 WETH

                const oneInchQuote = await oneInchAggregator.getQuote({
                    tokenIn: WETH,
                    tokenOut: USDC,
                    amountIn: amount
                });

                if (oneInchQuote) {
                    console.log("  ✅ Quote received:", oneInchQuote.amountOut.toString(), "USDC");
                    console.log("  DEX:", oneInchQuote.dex);
                    console.log("  Pool:", oneInchQuote.pool);
                } else {
                    console.log("  ❌ No quote received");
                }
            } catch (error) {
                console.log("  ❌ Quote error:", error instanceof Error ? error.message : error);
            }
        }
        console.log();
    } else {
        console.log("1inch API: Not configured\n");
    }

    // Test hybrid aggregator
    console.log("Testing Hybrid Aggregator...\n");
    
    if (zeroXHealthy || oneInchAggregator) {
        const hybridAggregator = new HybridAggregator(zeroXAggregator, oneInchAggregator || new OneInchAggregator("", ""));
        
        console.log("Health Check:");
        const health = await hybridAggregator.checkHealth();
        console.log("  0x:", health.zeroX ? "✅ Healthy" : "❌ Unhealthy");
        console.log("  1inch:", health.oneInch ? "✅ Healthy" : "❌ Unhealthy");
        console.log();

        if (health.zeroX || health.oneInch) {
            console.log("Testing hybrid quote (WETH -> USDC):");
            try {
                const WETH = "0x4200000000000000000000000000000000000006";
                const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
                const amount = BigInt("1000000000000000000"); // 1 WETH

                const bestQuote = await hybridAggregator.getBestQuote({
                    tokenIn: WETH,
                    tokenOut: USDC,
                    amountIn: amount
                });

                if (bestQuote) {
                    console.log("  ✅ Best quote received:", bestQuote.amountOut.toString(), "USDC");
                    console.log("  DEX:", bestQuote.dex);
                    console.log("  Pool:", bestQuote.pool);
                } else {
                    console.log("  ❌ No quote received from any aggregator");
                }
            } catch (error) {
                console.log("  ❌ Hybrid quote error:", error instanceof Error ? error.message : error);
            }
        }
    } else {
        console.log("❌ No aggregators available for testing");
    }

    console.log("\nTest Complete!");
}

testHybridAggregator().catch(console.error);
