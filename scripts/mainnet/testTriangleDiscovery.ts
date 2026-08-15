import { ethers } from "ethers";
import { JsonRpcProvider } from "ethers";
import { QuoteEngine } from "../../bot/scanner/QuoteEngine.js";
import { TriangularArbitrageScanner } from "../../bot/scanner/TriangularArbitrageScanner.js";
import { TOKENS, TOKEN_DECIMALS, parseUnits, formatUnits } from "../../bot/scanner/TokenList.js";
import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { AerodromeDexProvider } from "../../bot/scanner/quote/AerodromeDexProvider.js";
import { UniswapV3DexProvider } from "../../bot/scanner/quote/UniswapV3DexProvider.js";
import { PancakeSwapDexProvider } from "../../bot/scanner/quote/PancakeSwapDexProvider.js";
import { DexQuoteProvider } from "../../bot/scanner/quote/DexQuoteProvider.js";
import { DexProviderAdapter } from "../../bot/scanner/quote/DexProviderAdapter.js";

async function main() {
    console.log("Testing Triangle Discovery Engine");
    console.log("===================================\n");

    // Initialize provider
    const provider = new JsonRpcProvider(process.env.RPC_URL || "https://mainnet.base.org");
    
    // Initialize cache
    const poolCache = new PoolCache();
    
    // Initialize subgraph loader with triangle discovery settings
    const subgraphLoader = new SubgraphPoolLoader(poolCache);
    
    console.log("Loading pools from subgraph...");
    await subgraphLoader.loadForTriangleDiscovery(
        process.env.UNISWAP_SUBGRAPH_URL!,
        "", // Skip SushiSwap for now
        process.env.PANCAKESWAP_SUBGRAPH_URL!, // Add PancakeSwap
        process.env.AERODROME_SUBGRAPH_URL! // Add Aerodrome
    );
    
    const allPools = poolCache.getAll();
    const usdcPools = allPools.filter(p => 
        p.token0.toLowerCase() === TOKENS.USDC.toLowerCase() || 
        p.token1.toLowerCase() === TOKENS.USDC.toLowerCase()
    );
    const wethPools = allPools.filter(p => 
        p.token0.toLowerCase() === TOKENS.WETH.toLowerCase() || 
        p.token1.toLowerCase() === TOKENS.WETH.toLowerCase()
    );
    const uniswapPools = allPools.filter(p => p.dex === "UNISWAP");
    const aerodromePools = allPools.filter(p => p.dex === "AERODROME");
    const uniqueTokens = new Set(allPools.map(p => p.token0.toLowerCase()).concat(allPools.map(p => p.token1.toLowerCase())));
    
    console.log("=== Pool Summary ===");
    console.log(`Total pools: ${allPools.length}`);
    console.log(`USDC pools: ${usdcPools.length}`);
    console.log(`WETH pools: ${wethPools.length}`);
    console.log(`Unique tokens: ${uniqueTokens.size}`);
    console.log("By DEX:");
    console.log(`  UNISWAP: ${uniswapPools.length} pools`);
    console.log(`  AERODROME: ${aerodromePools.length} pools`);
    console.log("==================\n");
    
    // Build token graph
    console.log("Building token graph from pools...");
    const tokenGraph = subgraphLoader.buildTokenGraph();
    const { dexEdges } = tokenGraph;
    console.log(`Built graph: ${tokenGraph.tokens.size} tokens, ${tokenGraph.edges.size} edges`);
    
    // Show example connections
    const wethConnections = tokenGraph.edges.get(TOKENS.WETH.toLowerCase());
    console.log("Example token connections:");
    if (wethConnections) {
        const exampleConnections = Array.from(wethConnections).slice(0, 5);
        exampleConnections.forEach(token => {
            console.log(`  ${TOKENS.WETH.slice(0,6)} → ${token.slice(0,6)}`);
        });
    }
    console.log();
    
    // Generate triangles using anchor tokens
    console.log("Generating triangles with anchors: USDC, WETH");
    const triangles = subgraphLoader.generateAnchorTriangles(tokenGraph);
    console.log(`Generated ${triangles.length} triangles from token graph`);
    
    if (triangles.length > 0) {
        console.log("Example triangles:");
        triangles.slice(0, 3).forEach((triangle, index) => {
            console.log(`  ${index + 1}. ${triangle[0].slice(0,6)} → ${triangle[1].slice(0,6)} → ${triangle[2].slice(0,6)}`);
        });
    }
    console.log();
    
    // Initialize DEX providers
    const aerodromeProvider = new AerodromeDexProvider(
        provider,
        poolCache,
        process.env.AERODROME_ROUTER!
    );
    
    const uniswapProvider = new UniswapV3DexProvider(
        provider,
        poolCache,
        process.env.UNISWAP_QUOTER_ADDRESS!
    );
    
    const pancakeswapProvider = new PancakeSwapDexProvider(
        provider,
        poolCache,
        process.env.PANCAKESWAP_QUOTER_ADDRESS!
    );
    
    const dexProviders: DexQuoteProvider[] = [uniswapProvider]; // PancakeSwap disabled due to quote issues
    
    // Initialize quote engine with adapted DEX providers
    const adaptedProviders = dexProviders.map(p => new DexProviderAdapter(p));
    const quoteEngine = new QuoteEngine(adaptedProviders);
    
    // Initialize triangular scanner
    const triangularScanner = new TriangularArbitrageScanner(
        quoteEngine,
        dexProviders
    );
    
    // Set DEX edges for discovery engine
    triangularScanner.setDexEdges(dexEdges);
    
    // Use triangles generated earlier (already computed above)
    if (triangles.length > 0) {
        const triangleRoutes: any[] = triangles.map((triangle, index) => ({
            tokenA: triangle[0],
            tokenB: triangle[1],
            tokenC: triangle[2],
            routeName: `${triangle[0].slice(0,6)} → ${triangle[1].slice(0,6)} → ${triangle[2].slice(0,6)}`
        }));
        
        triangularScanner.setRoutes(triangleRoutes);
    }
    
    console.log("DEX Providers for Discovery:");
    dexProviders.forEach((provider, index) => {
        console.log(`  ${index + 1}. ${provider.getDexName()} (enabled: true)`);
    });
    console.log();
    
    // Debug: Show whitelist tokens
    const whitelist = process.env.TOKEN_WHITELIST ? process.env.TOKEN_WHITELIST.split(',').map(t => t.trim().toLowerCase()) : [];
    console.log("Token Whitelist Configuration:");
    console.log(`  Total whitelist tokens: ${whitelist.length}`);
    if (whitelist.length > 0) {
        console.log(`  Whitelist tokens: ${whitelist.slice(0, 5).map(t => t.slice(0,6)).join(', ')}${whitelist.length > 5 ? '...' : ''}`);
    } else {
        console.log(`  ⚠️ No whitelist configured (will scan all tokens)`);
    }
    console.log();
    
    console.log("Available triangular routes:");
    const routeList = triangularScanner.getRoutes();
    routeList.forEach((route, index) => {
        console.log(`  ${index + 1}. ${route.routeName}`);
    });
    console.log();
    
    // Test triangular discovery
    console.log("Testing triangular arbitrage with DEX-specific discovery...");
    
    const opportunities = await triangularScanner.scanWithDiscovery(
        -1.0 // Show all candidates (even negative ones) for debugging
    );

    if (opportunities.length > 0) {
        console.log(`✅ Found ${opportunities.length} triangular opportunities via discovery:`);
        for (const opp of opportunities) {
            console.log(`  ${opp.route.routeName}:`);
            console.log(`    Raw Profit: ${opp.profitPercentage.toFixed(4)}%`);
            console.log(`    Steps:`);
            opp.steps.forEach((step, index) => {
                console.log(`      ${index + 1}. ${step.from.slice(0,6)} → ${step.to.slice(0,6)} (${step.dex})`);
                console.log(`         ${step.amountIn.toString()} → ${step.amountOut.toString()}`);
            });
        }
    } else {
        console.log("❌ No triangular arbitrage opportunities found via discovery");
    }
    
    console.log("\nTest Complete!");
}

main().catch(console.error);
