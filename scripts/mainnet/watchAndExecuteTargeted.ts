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

// Safe defaults for a focused monitor. Existing environment values win.
process.env.WATCH_MODE ||= "list";
process.env.WATCH_PAIRS ||= [
    `${TOKENS.WETH},${TOKENS.USDC}`,
    `${TOKENS.WETH},${TOKENS.USDT}`,
    `${TOKENS.CBBTC},${TOKENS.USDC}`
].join(";");
process.env.SCAN_BATCH_SIZE ||= "1";
process.env.MAX_PAIRS_PER_SCAN ||= "3";
process.env.TOP_N_CANDIDATES ||= "1";
process.env.WATCH_POOL_REFRESH_LOOPS ||= "12";
process.env.WATCH_TEST_USD ||= "500";
process.env.WATCH_POLL_MS ||= "5000";
process.env.MIN_DEX_VARIETY ||= "2";
// Low-RPC watcher: use the 1inch API (INCH_API_KEY/INCH_API_BASE_URL) as an
// additional aggregated quote source for spread detection.
process.env.WATCH_USE_1INCH ||= "true";

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
console.log(`Pairs: ${process.env.WATCH_PAIRS}`);
console.log(`Execution: ${process.env.WATCH_ENABLE_EXECUTION}`);
if (process.env.INCH_API_KEY && process.env.INCH_API_BASE_URL) {
    console.log(`1inch API: enabled (${process.env.INCH_API_BASE_URL})`);
} else {
    console.log("1inch API: disabled (INCH_API_KEY / INCH_API_BASE_URL not set in env file)");
}

await import("./watchAndExecute.js");
