import { ethers } from "ethers";
import { JsonRpcProvider } from "ethers";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { TriangularArbitrageScanner } from "../../bot/scanner/TriangularArbitrageScanner.js";
import { ZeroXAggregator } from "../../bot/scanner/aggregator/ZeroXAggregator.js";
import { OneInchAggregator } from "../../bot/scanner/aggregator/OneInchAggregator.js";
import { HybridAggregator } from "../../bot/scanner/aggregator/HybridAggregator.js";
import { HybridAggregatorProvider } from "../../bot/scanner/quote/HybridAggregatorProvider.js";
import { TOKENS, TOKEN_DECIMALS, parseUnits } from "../../bot/scanner/TokenList.js";

async function testTriangularArbitrage() {
    console.log("Testing Triangular Arbitrage Scanner");
    console.log("===================================\n");

    // Initialize provider
    const provider = new JsonRpcProvider(process.env.BASE_RPC_URL || process.env.RPC_URL);
    
    // Initialize quote engine
    const quoteEngine = new QuoteEngine();
    
    // Add hybrid aggregator (0x primary, 1inch fallback)
    const ZEROX_API_URL = process.env.ZEROX_API_URL || "";
    const ZEROX_API_KEY = process.env.ZEROX_API_KEY || "";
    const INCH_API_KEY = process.env.INCH_API_KEY || "";
    const INCH_API_BASE_URL = process.env.INCH_API_BASE_URL || "";
    
    if (ZEROX_API_URL) {
        const VALID_TAKER = "0x5E2F886b10a49685317De61f521b0Cfa59579d60";
        const zeroXAggregator = new ZeroXAggregator(ZEROX_API_KEY, ZEROX_API_URL, 8453, VALID_TAKER);
        
        let oneInchAggregator: any = null;
        if (INCH_API_KEY && INCH_API_BASE_URL) {
            oneInchAggregator = new OneInchAggregator(INCH_API_KEY, INCH_API_BASE_URL);
        }
        
        const hybridAggregator = new HybridAggregator(zeroXAggregator, oneInchAggregator);
        const hybridProvider = new HybridAggregatorProvider(hybridAggregator);
        quoteEngine.registerProvider(hybridProvider);
    }

    // Initialize triangular scanner
    const triangularScanner = new TriangularArbitrageScanner(quoteEngine);
    
    console.log("Available triangular routes:");
    const routes = triangularScanner.getRoutes();
    routes.forEach((route, index) => {
        console.log(`  ${index + 1}. ${route.routeName}`);
    });
    console.log();

    // Test triangular scanner with dynamic decimals per route
    console.log("Testing triangular arbitrage with dynamic decimals per route...");
    
    const opportunities = await triangularScanner.scanTriangularOpportunities(
        BigInt(0), // Input amount ignored, scanner uses 1 unit of first token per route
        0.005 // 0.5% minimum profit
    );

    if (opportunities.length > 0) {
        console.log(`✅ Found ${opportunities.length} triangular opportunities:`);
        for (const opp of opportunities) {
            console.log(`  ${opp.route.routeName}:`);
            console.log(`    Profit: ${opp.profitPercentage.toFixed(2)}%`);
            console.log(`    Input: ${opp.inputAmount.toString()}`);
            console.log(`    Output: ${opp.outputAmount.toString()}`);
            console.log(`    Steps:`);
            opp.steps.forEach((step, index) => {
                console.log(`      ${index + 1}. ${step.from} → ${step.to} (${step.dex})`);
                console.log(`         ${step.amountIn.toString()} → ${step.amountOut.toString()}`);
            });
        }
    } else {
        console.log("❌ No triangular arbitrage opportunities found");
    }
    console.log();

    console.log("Test Complete!");
}

testTriangularArbitrage().catch(console.error);
