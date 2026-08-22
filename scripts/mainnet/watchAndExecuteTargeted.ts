/**
 * Low-RPC targeted watcher.
 *
 * This intentionally reuses the validated scanner/executor in
 * watchAndExecute.ts, but restricts it to a small fixed pair list.
 * Set WATCH_ENABLE_EXECUTION=true in the env file to allow transactions.
 */
import * as dotenv from "dotenv";

// Load the requested environment before importing the watcher. Defaults to
// .env.mainnet so a stale root .env can never shadow the production config.
const envPath = process.env.ENV_FILE || ".env.mainnet";
const envResult = dotenv.config({ path: envPath });
if (envResult.error && process.env.ENV_FILE) {
    throw new Error(`Failed to load environment file ${envPath}: ${envResult.error.message}`);
}
// Let the underlying watcher reload/log the same file instead of a default .env.
process.env.ENV_FILE ||= envPath;

const { TOKENS } = await import("../../bot/scanner/TokenList.js");

// m2: Explicit env defaults (check undefined/empty, not just falsy).
const envDefaults: Record<string, string> = {
    WATCH_MODE: "list",
    SCAN_BATCH_SIZE: "1",
    MAX_PAIRS_PER_SCAN: "3",
    TOP_N_CANDIDATES: "1",
    WATCH_POOL_REFRESH_LOOPS: "12",
    WATCH_TEST_USD: "500",
    WATCH_POLL_MS: "5000",
    SUBGRAPH_POOL_LIMIT: "50",
    MIN_DEX_VARIETY: "2",
    WATCH_USE_1INCH: "true",
    WATCH_ENABLE_EXECUTION: "false",
    MIN_LIQUIDITY_USD: "10000",
    // New audit config defaults for targeted mode
    FRESH_QUOTE_GATE: "true",
    USD_PRICE_CACHE_TTL_MS: "10000",
    POOL_STALE_AGE_MS: "300000",
    MAX_PARALLEL_BATCHES: "1",
    MAX_REJECT_LOG: "5",
};

for (const [key, value] of Object.entries(envDefaults)) {
    if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = value;
    }
}

// WATCH_PAIRS: only set if not already defined.
if (!process.env.WATCH_PAIRS) {
    process.env.WATCH_PAIRS = [
        `${TOKENS.WETH},${TOKENS.USDC}`,
        `${TOKENS.WETH},${TOKENS.USDT}`,
        `${TOKENS.CBBTC},${TOKENS.USDC}`
    ].join(";");
}

// Keep startup RPC usage low unless the user explicitly opts in.
// TARGETED_ALLOW_RPC_POOL_DISCOVERY=true enables factory RPC discovery for the
// requested pairs. An explicit POOL_RPC_FALLBACK setting is always respected
// (and logged), never silently overridden.
if (process.env.TARGETED_ALLOW_RPC_POOL_DISCOVERY === "true") {
    console.log("🔧 TARGETED_ALLOW_RPC_POOL_DISCOVERY=true — factory RPC pool discovery enabled");
} else if (process.env.POOL_RPC_FALLBACK === undefined) {
    process.env.POOL_RPC_FALLBACK = "false"; // subgraph-only by default
} else {
    console.warn(`⚠️ TARGETED_ALLOW_RPC_POOL_DISCOVERY is not "true" but POOL_RPC_FALLBACK=${process.env.POOL_RPC_FALLBACK} was set explicitly — respecting it`);
}

// Fail closed: execution must be explicitly enabled in the env file.
process.env.WATCH_ENABLE_EXECUTION ||= "false";

console.log("🎯 Targeted watcher configuration");
console.log(`Execution: ${process.env.WATCH_ENABLE_EXECUTION}`);
if (process.env.INCH_API_KEY && process.env.INCH_API_BASE_URL) {
    console.log(`1inch API: enabled (${process.env.INCH_API_BASE_URL})`);
} else {
    console.log("1inch API: disabled (INCH_API_KEY / INCH_API_BASE_URL not set in env file)");
}

await import("./watchAndExecute.js");
