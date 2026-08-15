import { TOKENS } from "./TokenList.js";

/**
 * Token Universe Configuration for Arbitrage Experiments
 * 
 * Tier 1 — 10–15 core tokens with high liquidity, high volume, strong cross-DEX availability
 * Tier 2 — Additional tokens that meet minimum quality thresholds
 */

// Tier 1: Core high-quality tokens
// Criteria: High liquidity, high volume, USDC/WETH pairs, available on Uniswap + PancakeSwap, low price impact
export const TIER_1_TOKENS = [
    TOKENS.WETH,      // 0x4200... - Core bridge token, highest liquidity
    TOKENS.USDC,      // 0x8335... - Major stablecoin, all pairs
    TOKENS.CBBTC,     // 0xcbb7... - Coinbase BTC, institutional adoption
    TOKENS.CBETH,     // 0x2ae3... - Coinbase ETH, institutional adoption
    TOKENS.USDT,      // 0xfde4... - Tether stablecoin, global standard
    TOKENS.DAI,       // 0x50c5... - MakerDAO stablecoin, DeFi standard
    TOKENS.AERO,      // 0x9401... - Base native token, strong liquidity
    TOKENS.VIRTUAL,   // 0x0b3e... - Virtual protocol, popular Base token
    TOKENS.EURC,      // 0x60a3... - Circle Euro, institutional stablecoin
    TOKENS.USDe,      // 0x5d3a... - Ethena stablecoin, growing adoption
];

// Tier 2: Additional quality tokens
// Criteria: Liquidity > $10k, 24h volume >= threshold, USDC pair available, WETH pair available, or strong Tier 1 connections
export const TIER_2_TOKENS = [
    TOKENS.RLUSD,      // 0x8d58... - Real USD stablecoin
    TOKENS.MORPHO_TOKEN, // 0xbaa5... - Morpho governance token
    TOKENS.wstETH,     // 0xc1cb... - Wrapped staked ETH
    TOKENS.sUSDS,      // 0x5875... - Sky stablecoin
    TOKENS.ZRO,        // 0x6985... - LayerZero, cross-chain token
    TOKENS.ZORA,       // 0x1111... - Zora network token
    TOKENS.LINK,       // 0x88fb... - Chainlink oracle token
    TOKENS.CRV,        // 0x8ee7... - Curve DAO token
    TOKENS.PENDLE,     // 0xa99f... - Pendle yield token
    TOKENS.KAITO,      // 0x98d0... - Kaito AI token
    TOKENS.DEGEN,      // 0x4ed4... - Degen chain token
];

// Universe configurations for A/B/C testing
export const TOKEN_UNIVERSES = {
    // Universe A: 10 high-quality tokens only
    UNIVERSE_A: {
        name: "Universe A - Tier 1 Only",
        tokens: TIER_1_TOKENS,
        description: "10 high-quality tokens with maximum liquidity and cross-DEX availability"
    },
    
    // Universe B: Tier 1 + Tier 2 (30 tokens total)
    UNIVERSE_B: {
        name: "Universe B - Tier 1 + Tier 2",
        tokens: [...TIER_1_TOKENS, ...TIER_2_TOKENS],
        description: "10 Tier 1 + 20 Tier 2 tokens for expanded opportunity set"
    },
    
    // Universe C: All available tokens (current behavior)
    UNIVERSE_C: {
        name: "Universe C - All Tokens",
        tokens: Object.values(TOKENS).filter((addr): addr is string => typeof addr === "string" && addr.length > 0),
        description: "All tokens that pass liquidity filter (baseline comparison)"
    }
};

// Current active universe (change this to switch between A/B/C)
let ACTIVE_UNIVERSE = TOKEN_UNIVERSES.UNIVERSE_C;

// Metrics tracking for universe comparison
export interface UniverseMetrics {
    universeName: string;
    tokenCount: number;
    trianglesFound: number;
    executableTriangles: number;
    positiveGrossProfit: number;
    positiveNetProfit: number;
    maxNetProfit: number;
    medianNetProfit: number;
    averageNetProfit: number;
    scanDuration: number;
}

// Metrics storage for comparison
export const UNIVERSE_METRICS: Map<string, UniverseMetrics> = new Map();

/**
 * Get active token universe
 */
export function getActiveUniverse() {
    return ACTIVE_UNIVERSE;
}

/**
 * Set active universe by name
 */
export function setActiveUniverse(universeName: keyof typeof TOKEN_UNIVERSES) {
    ACTIVE_UNIVERSE = TOKEN_UNIVERSES[universeName];
    console.log(`🔄 Switched to ${TOKEN_UNIVERSES[universeName].name}`);
    console.log(`   Tokens: ${TOKEN_UNIVERSES[universeName].tokens.length}`);
    console.log(`   Description: ${TOKEN_UNIVERSES[universeName].description}`);
}

/**
 * Record metrics for current universe
 */
export function recordUniverseMetrics(metrics: UniverseMetrics) {
    UNIVERSE_METRICS.set(metrics.universeName, metrics);
    console.log(`📊 Recorded metrics for ${metrics.universeName}`);
    console.log(`   Triangles: ${metrics.trianglesFound}`);
    console.log(`   Executable: ${metrics.executableTriangles}`);
    console.log(`   Positive Net: ${metrics.positiveNetProfit}`);
    console.log(`   Max Net Profit: ${metrics.maxNetProfit.toFixed(2)}%`);
}

/**
 * Compare all recorded universes
 */
export function compareUniverses() {
    console.log("\n📈 UNIVERSE COMPARISON REPORT");
    console.log("=" .repeat(80));
    
    for (const [name, metrics] of UNIVERSE_METRICS.entries()) {
        console.log(`\n${name}:`);
        console.log(`  Tokens: ${metrics.tokenCount}`);
        console.log(`  Triangles Found: ${metrics.trianglesFound}`);
        console.log(`  Executable: ${metrics.executableTriangles}`);
        console.log(`  Positive Gross: ${metrics.positiveGrossProfit}`);
        console.log(`  Positive Net: ${metrics.positiveNetProfit}`);
        console.log(`  Max Net Profit: ${metrics.maxNetProfit.toFixed(2)}%`);
        console.log(`  Median Net Profit: ${metrics.medianNetProfit.toFixed(2)}%`);
        console.log(`  Avg Net Profit: ${metrics.averageNetProfit.toFixed(2)}%`);
        console.log(`  Scan Duration: ${metrics.scanDuration.toFixed(2)}s`);
    }
    
    console.log("\n" + "=".repeat(80));
    
    // Find best universe by net profit opportunities
    let bestUniverse = null;
    let bestNetProfit = 0;
    
    for (const [name, metrics] of UNIVERSE_METRICS.entries()) {
        if (metrics.positiveNetProfit > bestNetProfit) {
            bestNetProfit = metrics.positiveNetProfit;
            bestUniverse = name;
        }
    }
    
    if (bestUniverse) {
        console.log(`\n🏆 BEST UNIVERSE: ${bestUniverse} (${bestNetProfit} positive net profit opportunities)`);
    }
}

/**
 * Reset all metrics
 */
export function resetMetrics() {
    UNIVERSE_METRICS.clear();
    console.log("🗑️  All universe metrics reset");
}
