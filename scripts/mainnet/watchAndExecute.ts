import * as dotenv from "dotenv";
import {
    JsonRpcProvider,
    FallbackProvider,
    Wallet,
    Contract,
    AbiCoder,
    parseUnits,
    formatUnits
} from "ethers";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
import { PoolLoader } from "../../bot/scanner/PoolLoader.js";
import { SubgraphPoolLoader } from "../../bot/scanner/SubgraphPoolLoader.js";
import { UniswapV3DexProvider } from "../../bot/scanner/quote/UniswapV3DexProvider.js";
import { SushiSwapDexProvider } from "../../bot/scanner/quote/SushiSwapDexProvider.js";
import { PancakeSwapDexProvider } from "../../bot/scanner/quote/PancakeSwapDexProvider.js";
import { AerodromeDexProvider } from "../../bot/scanner/quote/AerodromeDexProvider.js";
import { DexQuoteProvider } from "../../bot/scanner/quote/DexQuoteProvider.js";
import { QuoteResult } from "../../bot/scanner/quote/index.js";
import { AdapterRegistry } from "../../bot/registry/AdapterRegistry.js";
import { FlashLoanExecutor } from "../../bot/executor/FlashLoanExecutor.js";
import { TOKEN_DECIMALS, TOKENS } from "../../bot/scanner/TokenList.js";
import { TIER_1_TOKENS, TIER_2_TOKENS } from "../../bot/scanner/TokenUniverse.js";
import { toUniquePairs, batchPairs, filterPairs } from "../../bot/scanner/UniversalPairFilter.js";
import { getTokenPriceUSD } from "../../bot/utils/USDAmountConverter.js";

// Load .env.mainnet when no explicit environment file was supplied.
if (!process.env.ENV_FILE) {
    dotenv.config({ path: ".env.mainnet" });
}

// Load explicit environment file before reading configuration constants.
if (process.env.ENV_FILE) {
    const result = dotenv.config({ path: process.env.ENV_FILE });
    if (result.error) {
        console.log(`⚠️ Failed to load env file ${process.env.ENV_FILE}: ${result.error.message}`);
    } else {
        console.log(`🔧 Loaded env file: ${process.env.ENV_FILE}`);
    }
}

// ------------------------------------------------------------------
// Configuration (override via env)
// ------------------------------------------------------------------
const WATCH_PAIR_A = process.env.WATCH_TOKEN_A || TOKENS.WETH;
const WATCH_PAIR_B = process.env.WATCH_TOKEN_B || TOKENS.AERO;
// WATCH_MODE: "single" (default, pair A/B) | "all" (semua pair dari token universe) | "list" (pair dari WATCH_PAIRS)
const WATCH_MODE_RAW = (process.env.WATCH_MODE || "all").toLowerCase();
if (WATCH_MODE_RAW !== "single" && WATCH_MODE_RAW !== "all" && WATCH_MODE_RAW !== "list") {
    throw new Error(`Invalid WATCH_MODE "${WATCH_MODE_RAW}" — expected "single", "all", or "list"`);
}
const WATCH_MODE: "single" | "all" | "list" = WATCH_MODE_RAW;
const WATCH_PAIRS_CSV = process.env.WATCH_PAIRS || ""; // e.g. "0xAAA,0xBBB;0xCCC,0xDDD"
const WATCH_TOP_TOKENS = Number(process.env.WATCH_TOP_TOKENS || 0); // 0 = all tokens in the universe
const SCAN_BATCH_SIZE = Number(process.env.SCAN_BATCH_SIZE || 8);
const POOL_REFRESH_LOOPS = Number(process.env.WATCH_POOL_REFRESH_LOOPS || 12); // refresh pool cache every N loops (0 = never)
const POOL_RPC_FALLBACK = process.env.POOL_RPC_FALLBACK !== "false"; // fallback to factory RPC when subgraph is thin
const MIN_LIQUIDITY_USD = Number(process.env.MIN_LIQUIDITY_USD || 10000);
const MIN_DEX_VARIETY = Number(process.env.MIN_DEX_VARIETY || 2);
const MAX_PAIRS_PER_SCAN = Number(process.env.MAX_PAIRS_PER_SCAN || 200);
const TOP_N_CANDIDATES = Number(process.env.TOP_N_CANDIDATES || 5);
const TEST_AMOUNT_USD = Number(process.env.WATCH_TEST_USD || 1000); // Quote size in USD
const SPREAD_THRESHOLD_PCT = Number(process.env.SPREAD_THRESHOLD_PCT || 0.2); // e.g. 0.2%
const MIN_NET_PROFIT_USD = Number(process.env.MIN_NET_PROFIT_USD || 1);
// Same-direction quotes use identical token units. Extreme outliers are
// generally stale/invalid pools (for example a dust quote), not real spread.
const MAX_QUOTE_DEVIATION_X = Math.max(2, Number(process.env.MAX_QUOTE_DEVIATION_X || 10));
const POLL_INTERVAL_MS = Number(process.env.WATCH_POLL_MS || 5000); // 5s default
const MAX_LOAN_USD = Number(process.env.WATCH_MAX_LOAN_USD || 10000);
// Fail closed: execution requires an explicit WATCH_ENABLE_EXECUTION=true.
const ENABLE_EXECUTION = process.env.WATCH_ENABLE_EXECUTION === "true"; // default OFF
// Slippage tolerance: default 0.1%, clamped to [0.1%, 1.5%] — never defaults to the max.
const SLIPPAGE_PCT = Math.min(Math.max(Number(process.env.SLIPPAGE_PCT || 0.1), 0.1), 1.5);
// minProfit floor: keep this % of the quoted profit on-chain (clamped 10–90%).
// Demanding the full quoted profit reverts InsufficientProfit on any adverse
// price move between quote and execution; a fractional floor tolerates drift
// while still guaranteeing the trade clears a share of its quoted edge.
const MIN_PROFIT_BUFFER_PCT = Math.min(Math.max(Number(process.env.MIN_PROFIT_BUFFER_PCT || 50), 10), 90);
const VERBOSE = process.env.WATCH_VERBOSE === "true";
const GENERAL_DEX_NAMES = ["UniswapV3", "SushiSwap", "PancakeSwap"];
const EFFECTIVE_TEST_AMOUNT_USD = Math.min(TEST_AMOUNT_USD, MAX_LOAN_USD);

if (!Number.isFinite(TEST_AMOUNT_USD) || TEST_AMOUNT_USD <= 0) {
    throw new Error("WATCH_TEST_USD must be a positive number");
}
if (!Number.isFinite(MAX_LOAN_USD) || MAX_LOAN_USD <= 0) {
    throw new Error("WATCH_MAX_LOAN_USD must be a positive number");
}
const QUOTE_AMOUNT_USD = Math.min(TEST_AMOUNT_USD, MAX_LOAN_USD);

// ------------------------------------------------------------------
// ABI fragments shared with the engine (ArbitrageEngineV2)
// ------------------------------------------------------------------
const SwapStepTuple = "(address adapter,address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint256 minAmountOut,bytes data,uint256 deadline)";
const RouteTuple = `(${SwapStepTuple}[] swaps,address profitToken,uint256 minProfit)`;
const EXECUTE_ARBITRAGE_ABI = `function executeArbitrage(address token,uint256 amount,${RouteTuple} route)`;
const VALIDATE_ROUTE_ABI = `function validateRoute(${RouteTuple} route,address token) view returns (bool)`;

// ------------------------------------------------------------------
// Providers
// ------------------------------------------------------------------
const RPC_URLS = [...new Set([
    process.env.BASE_RPC_URL_1 || process.env.BASE_RPC_URL || process.env.RPC_URL,
    process.env.BASE_RPC_URL_2
].filter((url): url is string => Boolean(url)))];
if (RPC_URLS.length === 0) {
    throw new Error("BASE_RPC_URL not set in environment");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (ENABLE_EXECUTION && !PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set in environment (required for execution mode)");
}

const rpcProviders = RPC_URLS.map(url => new JsonRpcProvider(url));
const provider = rpcProviders.length > 1
    ? new FallbackProvider(rpcProviders.map((rpc, index) => ({
        provider: rpc,
        priority: index + 1,
        stallTimeout: 1500,
        weight: 1
    })))
    : rpcProviders[0];
const wallet = PRIVATE_KEY ? new Wallet(PRIVATE_KEY, provider) : null;
const poolCache = new PoolCache();

function buildDexProviders(): DexQuoteProvider[] {
    const providers: DexQuoteProvider[] = [];

    if (process.env.UNISWAP_QUOTER_ADDRESS && process.env.UNISWAP_FACTORY_ADDRESS) {
        providers.push(new UniswapV3DexProvider(
            provider, poolCache,
            process.env.UNISWAP_QUOTER_ADDRESS,
            process.env.UNISWAP_FACTORY_ADDRESS
        ));
    }
    if (process.env.SUSHISWAP_QUOTER_ADDRESS && process.env.SUSHISWAP_FACTORY_ADDRESS) {
        providers.push(new SushiSwapDexProvider(
            provider, poolCache,
            process.env.SUSHISWAP_QUOTER_ADDRESS,
            process.env.SUSHISWAP_FACTORY_ADDRESS
        ));
    }
    if (process.env.PANCAKESWAP_QUOTER_ADDRESS && process.env.PANCAKESWAP_FACTORY_ADDRESS) {
        providers.push(new PancakeSwapDexProvider(
            provider, poolCache,
            process.env.PANCAKESWAP_QUOTER_ADDRESS,
            process.env.PANCAKESWAP_FACTORY_ADDRESS
        ));
    }
    // AerodromeDexProvider uses the V2 router ABI (getAmountsOut). The
    // Slipstream quoter address is a different contract and must never be
    // used as a fallback here.
    const aerodromeRouter = process.env.AERODROME_ROUTER_ADDRESS;
    if (aerodromeRouter && process.env.AERODROME_FACTORY_ADDRESS) {
        providers.push(new AerodromeDexProvider(
            provider, poolCache,
            aerodromeRouter,
            process.env.AERODROME_FACTORY_ADDRESS
        ));
    }

    return providers;
}

function getDecimals(addr: string): number {
    return TOKEN_DECIMALS[addr.toLowerCase()] || 18;
}

function formatAmount(amount: bigint, addr: string): string {
    return Number(formatUnits(amount, getDecimals(addr))).toFixed(6);
}

function tokenAmountToNumber(amount: bigint, token: string): number {
    return Number(formatUnits(amount, getDecimals(token)));
}

function percentageOf(numerator: bigint, denominator: bigint): number {
    if (denominator <= 0n) return 0;
    return Number((numerator * 1_000_000n) / denominator) / 10_000;
}

/** Convert a USD test amount into raw token units for `token`.
 *  Uses a token→USDC quote as the USD price reference for non-stable tokens.
 */
async function usdToTokenAmount(usd: number, token: string): Promise<bigint> {
    const decimals = getDecimals(token);
    const lower = token.toLowerCase();

    // Stablecoins / near-$1 tokens
    const STABLE_LIKE = new Set([
        TOKENS.USDC.toLowerCase(),
        TOKENS.USDT.toLowerCase(),
        TOKENS.DAI.toLowerCase(),
        TOKENS.USDe.toLowerCase(),
        TOKENS.RLUSD.toLowerCase(),
        TOKENS.EURC.toLowerCase(),
        TOKENS.sUSDS.toLowerCase()
    ]);
    if (STABLE_LIKE.has(lower)) {
        return parseUnits(usd.toFixed(6), decimals);
    }

    // Price each token directly against USDC.
    const tokenAmount = usd / await tokenUsdPrice(token);
    return parseUnits(tokenAmount.toFixed(6), decimals);
}

// USD pricing helper: try every configured DEX provider (Uniswap first —
// deepest liquidity), then fall back to the static USDAmountConverter table.
let _priceProviders: DexQuoteProvider[] | null = null;
const _usdPriceCache = new Map<string, { price: number; expiresAt: number }>();
async function quoteOnRaw(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
    if (!_priceProviders) _priceProviders = buildDexProviders();
    for (const p of _priceProviders) {
        try {
            const q = await p.quote({ tokenIn, tokenOut, amountIn });
            if (q && q.amountOut > 0n) return q;
        } catch {
            // Try the next provider.
        }
    }
    return null;
}

async function tokenUsdPrice(token: string): Promise<number> {
    const stable = new Set([
        TOKENS.USDC, TOKENS.USDT, TOKENS.DAI, TOKENS.USDe,
        TOKENS.RLUSD, TOKENS.EURC, TOKENS.sUSDS
    ].map(t => t.toLowerCase()));
    const lower = token.toLowerCase();
    if (stable.has(lower)) return 1;
    const cached = _usdPriceCache.get(lower);
    if (cached && cached.expiresAt > Date.now()) return cached.price;
    const quote = await quoteOnRaw(token, TOKENS.USDC, parseUnits("1", getDecimals(token)));
    if (quote && quote.amountOut > 0n) {
        const price = Number(formatUnits(quote.amountOut, getDecimals(TOKENS.USDC)));
        if (Number.isFinite(price) && price > 0) {
            _usdPriceCache.set(lower, { price, expiresAt: Date.now() + 30_000 });
            return price;
        }
    }

    // Last resort: static price table — better than failing the whole pair.
    const tablePrice = getTokenPriceUSD(token);
    if (Number.isFinite(tablePrice) && tablePrice > 0) {
        _usdPriceCache.set(lower, { price: tablePrice, expiresAt: Date.now() + 300_000 });
        return tablePrice;
    }
    throw new Error(`No USD price available for ${token}`);
}

async function tokenAmountToUsd(amount: bigint, token: string): Promise<number> {
    return Number(formatUnits(amount, getDecimals(token))) * await tokenUsdPrice(token);
}

/** Quote a single direction on one provider, returning amountOut (0 if unavailable). */
async function quoteOn(
    provider_: DexQuoteProvider,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
): Promise<QuoteResult | null> {
    try {
        const q = await provider_.quote({ tokenIn, tokenOut, amountIn });
        if (q && q.amountOut > 0n) {
            return q;
        }
        return null;
    } catch {
        return null;
    }
}

function filterQuoteOutliers<T extends { q: QuoteResult }>(quotes: T[], label: string): T[] {
    if (quotes.length < 3) return quotes;
    const values = quotes.map(x => x.q.amountOut).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const median = values[Math.floor(values.length / 2)];
    if (!median || median <= 0n) return [];
    const factor = BigInt(Math.ceil(MAX_QUOTE_DEVIATION_X * 1000));
    const kept = quotes.filter(x => {
        const out = x.q.amountOut;
        return out * 1000n >= median * 1000n / factor && out * 1000n <= median * factor;
    });
    if (VERBOSE && kept.length !== quotes.length) {
        console.log(`  [quote-filter] ${label}: removed ${quotes.length - kept.length} outlier quote(s), median=${median.toString()}, limit=${MAX_QUOTE_DEVIATION_X}x`);
    }
    return kept;
}

// ------------------------------------------------------------------
// Multi-pair scan helpers (WATCH_MODE = all | list)
// ------------------------------------------------------------------
function parseWatchPairs(csv: string): { tokenA: string; tokenB: string }[] {
    return csv
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [a, b] = part.split(",").map(s => s.trim());
            return { tokenA: a, tokenB: b };
        })
        .filter(p => p.tokenA && p.tokenB);
}

function resolveScanPairs(): { tokenA: string; tokenB: string }[] {
    if (WATCH_MODE === "list") {
        const pairs = parseWatchPairs(WATCH_PAIRS_CSV);
        if (pairs.length === 0) {
            throw new Error("WATCH_MODE=list but WATCH_PAIRS empty/invalid (format: 0xAAA,0xBBB;0xCCC,0xDDD)");
        }
        return pairs;
    }
    if (WATCH_MODE === "all") {
        // Tier 1 + Tier 2 from TokenUniverse (21 tokens) → unique pairs.
        const tokenSet = new Set([...TIER_1_TOKENS, ...TIER_2_TOKENS].map(t => t.toLowerCase()));
        const allTokens = [...tokenSet];
        const tokens = WATCH_TOP_TOKENS > 0
            ? allTokens.slice(0, WATCH_TOP_TOKENS)
            : allTokens;
        const pairs = toUniquePairs(tokens);
        console.log(`🧾 WATCH_MODE=all: ${tokens.length}/${allTokens.length} tokens → ${pairs.length} candidate pairs (batch ${SCAN_BATCH_SIZE}, minLiquidity $${MIN_LIQUIDITY_USD}, minDex ${MIN_DEX_VARIETY})`);
        return pairs;
    }
    // single (default)
    return [{ tokenA: WATCH_PAIR_A, tokenB: WATCH_PAIR_B }];
}

/** Why a candidate pair was dropped by filterPairs (mirrors its rejection order). */
function pairRejectReason(pair: { tokenA: string; tokenB: string }): string {
    const matches = poolCache.findPair(pair.tokenA, pair.tokenB);
    const loadedDexes = new Set(poolCache.getAll().map(p => p.dex.toLowerCase()));
    const canVerifyVariety = loadedDexes.size >= MIN_DEX_VARIETY;

    if (canVerifyVariety && matches.length === 0) {
        return "no pools in cache for this pair (subgraph/RPC did not load it)";
    }
    if (canVerifyVariety && new Set(matches.map(p => p.dex.toLowerCase())).size < MIN_DEX_VARIETY) {
        const dexes = [...new Set(matches.map(pool => pool.dex))].join(",") || "none";
        return `dex variety: ${dexes} < required ${MIN_DEX_VARIETY}`;
    }
    // Mirror filterPairs' liquidity rule exactly: reject only when EVERY
    // matching pool has a known liquidity value below the threshold. Unknown
    // RPC liquidity is not zero liquidity.
    const knownValues = matches.map(pool => {
        const values = [pool.reserveUSD, pool.totalValueLockedUSD]
            .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
        return values.length > 0 ? Math.max(...values) : undefined;
    });
    const allKnown = knownValues.length > 0 && knownValues.every(value => value !== undefined);
    if (allKnown && knownValues.every(value => (value as number) < MIN_LIQUIDITY_USD)) {
        return `liquidity $${Math.max(...(knownValues as number[])).toFixed(2)} < required $${MIN_LIQUIDITY_USD}`;
    }
    // Passed every check — the only way filterPairs dropped it is the cap.
    return `capped by MAX_PAIRS_PER_SCAN=${MAX_PAIRS_PER_SCAN} (pair passed liquidity/dex checks)`;
}

/** Quote all pairs in bounded batches; returns only top{N} candidates by net USD. */
async function scanAllPairs(
    pairs: { tokenA: string; tokenB: string }[],
    dexProviders: DexQuoteProvider[],
    amountInForToken: (token: string) => Promise<bigint>,
    formatAmount: (amount: bigint, addr: string) => string
): Promise<any[]> {
    const filtered = filterPairs(pairs as any, {
        minLiquidityUSD: MIN_LIQUIDITY_USD,
        minDexVariety: MIN_DEX_VARIETY,
        maxPairsPerScan: MAX_PAIRS_PER_SCAN,
        poolCache
    });
    const accepted = new Set(filtered.map(pair => `${pair.tokenA.toLowerCase()}|${pair.tokenB.toLowerCase()}`));
    const dropped = pairs.filter(pair => !accepted.has(`${pair.tokenA.toLowerCase()}|${pair.tokenB.toLowerCase()}`));
    console.log(`[SCAN] configured=${pairs.length}, eligible=${filtered.length}, mode=${WATCH_MODE}`);
    if (filtered.length === 0) {
        console.log("[SCAN] No pairs passed liquidity/DEX filter; waiting for pool refresh");
    }
    // Always surface dropped pairs (with reasons) so a silently filtered pair is
    // visible without WATCH_VERBOSE. Per-pair detail is capped to avoid log spam
    // on large universes.
    const MAX_REJECT_LOG = 20;
    if (dropped.length > 0) {
        const showAll = VERBOSE || dropped.length <= MAX_REJECT_LOG;
        const shown = showAll ? dropped : dropped.slice(0, MAX_REJECT_LOG);
        for (const pair of shown) {
            console.log(`[FILTER] ${pair.tokenA.slice(0, 8)}↔${pair.tokenB.slice(0, 8)} rejected: ${pairRejectReason(pair)}`);
        }
        if (!showAll) {
            console.log(`[FILTER] … and ${dropped.length - MAX_REJECT_LOG} more dropped pairs (set WATCH_VERBOSE=true for the full list)`);
        }
    }
    if (VERBOSE && filtered.length !== pairs.length) {
        console.log(`  🧹 Filter: ${pairs.length} → ${filtered.length} pair (liquidity/dex)`);
    }

    const candidates: any[] = [];
    let totalQualified = 0;
    const batches = batchPairs(filtered as any, SCAN_BATCH_SIZE);

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchResults = await Promise.all(
            batch.map(async (pair: any) => {
                try {
                    const amountIn = await amountInForToken(pair.tokenA);
                    if (amountIn <= 0n) return null;

                    // Phase 1: quote A→B on every DEX.
                    const buyQuotes: { dex: string; q: QuoteResult }[] = [];
                    for (const dex of dexProviders) {
                        const qBuy = await quoteOn(dex, pair.tokenA, pair.tokenB, amountIn);
                        if (qBuy) buyQuotes.push({ dex: dex.getDexName(), q: qBuy });
                    }
                    const saneBuyQuotes = filterQuoteOutliers(buyQuotes, "buy");
                    if (saneBuyQuotes.length < 2) {
                        return null;
                    }

                    // Best buy = highest amountOut of B for the same amountIn of A.
                    saneBuyQuotes.sort((a, b) => (a.q.amountOut > b.q.amountOut ? -1 : 1));
                    const bestBuy = saneBuyQuotes[0];
                    const buyAmountOut = bestBuy.q.amountOut;

                    // Phase 2: quote B→A on every DEX using the SAME buyAmountOut.
                    const sellQuotes: { dex: string; q: QuoteResult }[] = [];
                    for (const dex of dexProviders) {
                        const qSell = await quoteOn(dex, pair.tokenB, pair.tokenA, buyAmountOut);
                        if (qSell) sellQuotes.push({ dex: dex.getDexName(), q: qSell });
                    }
                    const saneSellQuotes = filterQuoteOutliers(sellQuotes, "sell");

                    // Best round-trip: buy at bestBuy.dex, sell at the best cross-DEX.
                    let bestForPair: any = null;
                    for (const sell of saneSellQuotes) {
                        if (sell.dex === bestBuy.dex) continue; // must be cross-DEX
                        const amountBack = sell.q.amountOut;
                        if (amountBack <= amountIn) continue;
                        const profit = amountBack - amountIn;
                        const profitUSD = await tokenAmountToUsd(profit, pair.tokenA);
                        const spreadPct = Number((profit * 1000000n) / amountIn) / 10000;
                        if (!bestForPair || profitUSD > bestForPair.netProfitUSD) {
                            bestForPair = {
                                pair,
                                spreadPct,
                                netProfitUSD: profitUSD,
                                forward: bestBuy.q,
                                reverse: sell.q,
                                amountIn,
                                profit
                            };
                        }
                    }
                    if (VERBOSE && !bestForPair) {
                        console.log(`  [scan] ${pair.tokenA.slice(0,6)}→${pair.tokenB.slice(0,6)}: buys=${buyQuotes.map(x=>x.dex).join(",")} sells=${sellQuotes.length}, no cross-DEX profit`);
                    }
                    return bestForPair;
                } catch {
                    return null;
                }
            })
        );

        for (const r of batchResults) {
            if (!r) continue;
            totalQualified++;
            candidates.push(r);
        }

        if (VERBOSE) {
            const bestInBatch = candidates.reduce<number>((mx, c) => Math.max(mx, c.netProfitUSD || 0), 0);
            console.log(`  batch ${b + 1}/${batches.length}: ${batch.length} pair, qualified=${totalQualified}, bestBatch=$${bestInBatch.toFixed(2)}`);
        }
    }

    // Sort desc by net USD, keep only top N.
    candidates.sort((a, b) => (b.netProfitUSD || 0) - (a.netProfitUSD || 0));
    return candidates.slice(0, TOP_N_CANDIDATES);
}

/** Build a minimal opportunity object for FlashLoanExecutor from two crossed quotes.
 *  Steps are built as SwapStep tuples matching ArbitrageEngineV2's route struct:
 *  (adapter, tokenIn, tokenOut, fee, amountIn, minAmountOut, data, deadline)
 */
async function buildOpportunity(
    forward: QuoteResult,
    reverse: QuoteResult,
    tokenIn: string,
    amountIn: bigint,
    profit: bigint,
    adapterRegistry: AdapterRegistry
): Promise<any> {
    const step = (q: QuoteResult, amountInRaw: bigint, minOut: bigint) => ({
        adapter: adapterRegistry.get(q.dex),
        tokenIn: q.tokenIn,
        tokenOut: q.tokenOut,
        fee: q.fee ?? 0,
        amountIn: amountInRaw,
        minAmountOut: minOut,
        data: q.dex === "AERODROME"
            ? AbiCoder.defaultAbiCoder().encode(
                ["bool", "address"],
                [q.stable ?? false, q.factory ?? "0x0000000000000000000000000000000000000000"]
            )
            : "0x",
        deadline: Math.floor(Date.now() / 1000) + 60
    });

    // Apply slippage tolerance to each leg's minimum output (capped at 1.5%).
    const slip = (out: bigint) => (out * (1000n - BigInt(Math.round(SLIPPAGE_PCT * 10)))) / 1000n;
    const steps = [
        step(forward, amountIn, slip(forward.amountOut)),
        // Let ArbitrageEngineV2 use the actual output of the first leg.
        step(reverse, 0n, slip(reverse.amountOut))
    ];

    // Net profit in USD: raw profit → token units → USD. Use the
    // USDAmountConverter price table, falling back to a live quote when the
    // converter has no entry for the profit token.
    let tokenPriceUSD = getTokenPriceUSD(tokenIn);
    if (!Number.isFinite(tokenPriceUSD) || tokenPriceUSD <= 0) {
        tokenPriceUSD = await tokenUsdPrice(tokenIn);
    }
    const netProfitUSD = Number(formatUnits(profit, getDecimals(tokenIn))) * tokenPriceUSD;

    return {
        route: {
            swaps: steps,
            profitToken: tokenIn,
            // Never demand the full quoted profit on-chain: a small adverse price
            // move between quote and execution would revert InsufficientProfit.
            // Keep a MIN_PROFIT_BUFFER_PCT% floor of the quoted profit instead.
            minProfit: (profit * (100n - BigInt(MIN_PROFIT_BUFFER_PCT))) / 100n
        },
        inputAmount: amountIn,
        outputAmount: amountIn + profit,
        profit,
        netProfitUSD
    };
}

/**
 * Net profit after estimated gas (in USD). Gas limit comes from an on-chain
 * simulation when possible (estimateOpportunityGas), otherwise a flat estimate;
 * gas price from the provider's latest fee data. Falls back to the raw net
 * profit when pricing is unavailable so monitoring is never blocked.
 */
async function netProfitAfterGasUSD(ex: FlashLoanExecutor, opp: any, token: string): Promise<number> {
    const base = opp?.netProfitUSD || 0;
    try {
        const feeData = await provider.getFeeData();
        const gasPrice = feeData?.maxFeePerGas ?? feeData?.gasPrice ?? 0n;
        if (gasPrice <= 0n) return base;
        let gasLimit = 600000n; // typical flash-loan arbitrage gas
        try {
            gasLimit = await ex.estimateOpportunityGas(opp, token);
        } catch {
            // Route not simulatable (e.g. adapter not deployed) — keep flat estimate.
        }
        const ethPrice = await tokenUsdPrice(TOKENS.WETH);
        const gasUSD = Number(formatUnits(gasPrice * gasLimit, 18)) * ethPrice;
        return Math.max(0, base - gasUSD);
    } catch {
        return base;
    }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
    const network = await provider.getNetwork();
    if (network.chainId !== 8453n) {
        throw new Error(`Wrong network: expected Base mainnet (8453), got ${network.chainId}`);
    }
    console.log("🚀 Spread Monitor + Auto-Execute");
    console.log("=================================");
    if (WATCH_MODE === "list") {
        console.log(`Pairs: ${WATCH_PAIRS_CSV}`);
    } else {
        console.log(`Pair: ${WATCH_PAIR_A.slice(0,6)} ↔ ${WATCH_PAIR_B.slice(0,6)}`);
    }
    console.log(`Threshold: ${SPREAD_THRESHOLD_PCT}% | Test USD: $${TEST_AMOUNT_USD} | Min net: $${MIN_NET_PROFIT_USD} | Poll: ${POLL_INTERVAL_MS}ms | Slippage: ${SLIPPAGE_PCT}%`);
    console.log(`Execution: ${ENABLE_EXECUTION ? "ENABLED" : "DISABLED (watch only)"}`);
    console.log(`Signer: ${wallet ? wallet.address : "n/a (watch-only, no PRIVATE_KEY)"}`);
    console.log();

    let dexProviders = buildDexProviders();
    if (dexProviders.length < 2) {
        console.log("⚠️ Need at least 2 DEX providers configured. Check env (UNISWAP/SUSHISWAP/PANCAKESWAP/AERODROME *_QUOTER/_FACTORY).");
        return;
    }
    console.log(`✅ ${dexProviders.length} DEX providers ready: ${dexProviders.map(d => d.getDexName()).join(", ")}\n`);

    // Set up executor if execution enabled
    let executor: FlashLoanExecutor | null = null;
    let adapterRegistry: AdapterRegistry | null = null;
    let engineContract: Contract | null = null;
    if (ENABLE_EXECUTION) {
        const engineAddress = process.env.ARBITRAGE_ENGINE_V2_ADDRESS;
        if (!engineAddress) {
            console.log("⚠️ ARBITRAGE_ENGINE_V2_ADDRESS missing — falling back to watch-only");
        } else {
            adapterRegistry = new AdapterRegistry(
                process.env.UNISWAP_ADAPTER_V2_ADDRESS || "",
                process.env.SUSHISWAP_ADAPTER_V2_ADDRESS || "",
                process.env.PANCAKESWAP_ADAPTER_V2_ADDRESS || "",
                process.env.AERODROME_ADAPTER_V2_ADDRESS || ""
            );
            engineContract = new Contract(
                engineAddress,
                // ABI matching ArbitrageEngineV2: executeArbitrage(token, amount, route) and validateRoute(route, token)
                [
                    EXECUTE_ARBITRAGE_ABI,
                    VALIDATE_ROUTE_ABI
                ],
                wallet!
            );
            executor = new FlashLoanExecutor(engineContract, adapterRegistry);

            // Only DEXes with a configured adapter can execute (the deployed
            // engine approves specific adapters). Restrict scanning in execution
            // mode so opportunities that could never pass validateRoute are not
            // surfaced as executable candidates.
            const withAdapter = dexProviders.filter(d => {
                try {
                    return /^0x[a-fA-F0-9]{40}$/.test(adapterRegistry!.get(d.getDexName()));
                } catch {
                    return false;
                }
            });
            if (withAdapter.length !== dexProviders.length) {
                const dropped = dexProviders.filter(d => !withAdapter.includes(d)).map(d => d.getDexName());
                console.log(`  ⚠️ Execution mode: ${dropped.join(", ")} has a quoter but no configured adapter — scanning only ${withAdapter.map(d => d.getDexName()).join(", ")}`);
            }
            if (withAdapter.length > 0) dexProviders = withAdapter;
            if (dexProviders.length < 2) {
                console.log("  ⚠️ Fewer than 2 executable DEXes — no cross-DEX arbitrage possible in execution mode");
            }
            console.log(`✅ Execution ready (engine ${engineAddress.slice(0,8)}…)\n`);
        }
    }

    // Amount for monitoring (in token A units) — kept for single mode
    let amountInSingle: bigint | undefined;

    // Preload pool cache from subgraphs (lightweight GraphQL; avoids RPC rate limits) — enables MIN_DEX_VARIETY/MIN_LIQUIDITY filters.
    const SUBGRAPH_POOL_LIMIT_N = Number(process.env.SUBGRAPH_POOL_LIMIT || 20);

    // (Re)load pool cache: subgraph first (light); factory RPC fallback when subgraph thin/failed.
    async function refreshPoolCache(): Promise<void> {
        poolCache.clear();
        const subgraphLoader = new SubgraphPoolLoader(poolCache);
        const perDexCount: Record<string, number> = {};
        const triedDexes: string[] = [];

        // 1) Subgraph (preferred: includes TVL → MIN_LIQUIDITY_USD works)
        for (const [name, subgraphUrl] of [
            ["UniswapV3", process.env.UNISWAP_SUBGRAPH_URL],
            ["SushiSwap", process.env.SUSHISWAP_SUBGRAPH_URL],
            ["PancakeSwap", process.env.PANCAKESWAP_SUBGRAPH_URL],
            ["Aerodrome", process.env.AERODROME_SUBGRAPH_URL],
        ] as const) {
            if (!subgraphUrl) continue;
            const before = poolCache.size();
            try {
                if (name === "Aerodrome") await subgraphLoader.loadAerodrome(subgraphUrl, SUBGRAPH_POOL_LIMIT_N);
                else if (name === "SushiSwap") await subgraphLoader.loadSushiSwap(subgraphUrl, SUBGRAPH_POOL_LIMIT_N);
                else if (name === "PancakeSwap") await subgraphLoader.loadPancakeSwap(subgraphUrl, SUBGRAPH_POOL_LIMIT_N);
                else await subgraphLoader.loadUniswap(subgraphUrl, SUBGRAPH_POOL_LIMIT_N);
            } catch (e: any) {
                console.log(`  ⚠️ Subgraph ${name} load failed (${e?.message || String(e)})`);
            }
            const added = poolCache.size() - before;
            perDexCount[name] = added;
            triedDexes.push(name);
        }

        // Always preload the WETH/USDC anchor pair used for USD sizing. The
        // top-pools query may omit it when the configured limit is small.
        if (process.env.UNISWAP_SUBGRAPH_URL) {
            try {
                await subgraphLoader.loadUniswapTokenPair(
                    process.env.UNISWAP_SUBGRAPH_URL,
                    TOKENS.WETH.toLowerCase(),
                    TOKENS.USDC.toLowerCase()
                );
            } catch (e: any) {
                if (VERBOSE) console.log(`  Uniswap anchor pair load failed (${e?.message || String(e)})`);
            }
        }

        // Targeted mode must load the explicitly requested pairs even when
        // they are absent from the subgraph's top-pools result.
        if (WATCH_MODE === "list" && process.env.TARGETED_ALLOW_RPC_POOL_DISCOVERY === "true") {
            const targetedPairs = resolveScanPairs();
            const targetedFactories = [
                ["UNISWAP", process.env.UNISWAP_FACTORY_ADDRESS],
                ["SUSHISWAP", process.env.SUSHISWAP_FACTORY_ADDRESS],
                ["PANCAKESWAP", process.env.PANCAKESWAP_FACTORY_ADDRESS],
                ["AERODROME", process.env.AERODROME_FACTORY_ADDRESS]
            ] as const;
            const targetedLoader = new PoolLoader(provider, poolCache);
            for (const pair of targetedPairs) {
                for (const [dex, factory] of targetedFactories) {
                    if (!factory) continue;
                    try {
                        await targetedLoader.loadPair(factory, dex, pair.tokenA, pair.tokenB);
                    } catch (e: any) {
                        if (VERBOSE) console.log(`  Targeted ${dex} pair load failed: ${e?.message || String(e)}`);
                    }
                }
            }
        }

        // 2) Factory RPC fallback for DEXes with no subgraph pools (uses WS/RPC rate limiter)
        if (POOL_RPC_FALLBACK) {
            const rpcLoader = new PoolLoader(provider, poolCache);
            for (const [name, factoryAddr] of [
                ["UniswapV3", process.env.UNISWAP_FACTORY_ADDRESS],
                ["SushiSwap", process.env.SUSHISWAP_FACTORY_ADDRESS],
                ["PancakeSwap", process.env.PANCAKESWAP_FACTORY_ADDRESS],
                ["Aerodrome", process.env.AERODROME_FACTORY_ADDRESS],
            ] as const) {
                if (!factoryAddr) continue;
                // Aerodrome subgraph entries use CL metadata and do not carry the
                // V2 stable flag required by the router, so always load its V2
                // pools from the factory.
                if ((perDexCount[name] ?? 0) > 0 && name !== "Aerodrome") continue; // subgraph already provided
                const before = poolCache.size();
                try {
                    if (name === "Aerodrome") await rpcLoader.loadAerodrome(factoryAddr);
                    else if (name === "SushiSwap") await rpcLoader.loadSushiSwap(factoryAddr);
                    else if (name === "PancakeSwap") await rpcLoader.loadPancakeSwap(factoryAddr);
                    else await rpcLoader.loadUniswap(factoryAddr);
                } catch (e: any) {
                    console.log(`  ⚠️ RPC fallback ${name} failed (${e?.message || String(e)})`);
                }
                const added = poolCache.size() - before;
                if (added > 0) console.log(`  📦 RPC fallback +${name}: ${added} pools`);
            }
        }

        const loaded = triedDexes.filter(d => (perDexCount[d] ?? 0) > 0 || poolCache.getAll().some(p => p.dex.toLowerCase() === d.toLowerCase()));
        const cachePools = poolCache.getAll();
        const rpcReservePools = cachePools.filter(p => p.liquiditySource === "rpc" && p.reserve0Raw !== undefined && p.reserve1Raw !== undefined).length;
        const usdLiquidityPools = cachePools.filter(p => Number.isFinite(p.reserveUSD) && (p.reserveUSD ?? 0) > 0).length;
        console.log(`  Liquidity metadata: USD/TVL=${usdLiquidityPools}, RPC reserves=${rpcReservePools}, unknown=${cachePools.length - Math.max(usdLiquidityPools, rpcReservePools)}`);
        console.log(`  📦 PoolCache: ${poolCache.size()} pools (${triedDexes.map(d => `${d}=${perDexCount[d] ?? "rpc"}`).join(", ")})`);
    }

    await refreshPoolCache();
    console.log();
    if (WATCH_MODE === "single") {
        try {
            amountInSingle = await usdToTokenAmount(EFFECTIVE_TEST_AMOUNT_USD, WATCH_PAIR_A);
            console.log(`Single-pair monitoring amount: ${formatAmount(amountInSingle, WATCH_PAIR_A)} ${WATCH_PAIR_A.slice(0,6)} (~$${EFFECTIVE_TEST_AMOUNT_USD})\n`);
        } catch (e: any) {
            console.error(`❌ Cannot size the monitoring amount for ${WATCH_PAIR_A.slice(0,6)} (${e?.message || String(e)}).`);
            console.error("   USD pricing needs UNISWAP_QUOTER_ADDRESS/UNISWAP_FACTORY_ADDRESS (or use WATCH_MODE=list). Exiting.");
            process.exit(1);
        }
    }

    const scanPairs = resolveScanPairs();

    let loop = 0;

    // Infinite loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
        loop++;
        const startTime = Date.now();

        // Build per-token amount lazily (only for pairs actually scanned)
        const amountCache = new Map<string, bigint>();
        const amountFor = async (token: string): Promise<bigint> => {
            const key = token.toLowerCase();
            const cached = amountCache.get(key);
            if (cached) return cached;
            const v = await usdToTokenAmount(EFFECTIVE_TEST_AMOUNT_USD, token);
            amountCache.set(key, v);
            return v;
        };

        // -------- Multi-pair mode (all/list) --------
        if (WATCH_MODE === "all" || WATCH_MODE === "list") {
            // Periodic pool refresh (subgraph first, RPC fallback)
            if (POOL_REFRESH_LOOPS > 0 && loop % POOL_REFRESH_LOOPS === 0) {
                if (VERBOSE) console.log(`  🔄 Refreshing pool cache (loop ${loop})`);
                try {
                    await refreshPoolCache();
                } catch (e: any) {
                    console.log(`  ⚠️ Pool refresh failed (${e?.message || String(e)}) — using previous cache`);
                }
            }

            const topCandidates = await scanAllPairs(scanPairs, dexProviders, amountFor, formatAmount);
            const best = topCandidates[0] ?? null;

            if (!best || best.netProfitUSD <= 0) {
                if (loop % 12 === 1) console.log(`[${new Date().toISOString()}] No profitable cross-DEX pair in ${scanPairs.length} pairs (loop ${loop})`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }

            const { spreadPct, netProfitUSD, forward, reverse, amountIn, profit } = best;
            const tokenA = forward.tokenIn;
            console.log(`\n[${new Date().toISOString()}] 🎯 Best cross-DEX spread: ${tokenA.slice(0,6)}↔${forward.tokenOut.slice(0,6)} ${forward.dex}→${reverse.dex} = ${spreadPct.toFixed(3)}% | net ~$${netProfitUSD.toFixed(2)}`);

            // Threshold checks (same as single mode)
            if (spreadPct < SPREAD_THRESHOLD_PCT) {
                if (VERBOSE) console.log(`  Below threshold ${SPREAD_THRESHOLD_PCT}%, skipping`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }
            if (netProfitUSD < MIN_NET_PROFIT_USD) {
                console.log(`  Net profit $${netProfitUSD.toFixed(2)} < $${MIN_NET_PROFIT_USD}, skipping`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }
            if (!executor) {
                console.log("  ⚠️ Execution not configured — would execute but watch-only mode.");
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }

            const opp = await buildOpportunity(forward, reverse, tokenA, amountIn, profit, adapterRegistry!);
            try {
                const ok = await engineContract!.validateRoute(opp.route, tokenA);
                if (!ok) {
                    console.log("  ⚠️ validateRoute returned false — skipping execution");
                    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                    continue;
                }
            } catch (e: any) {
                console.log(`  ⚠️ validateRoute failed (${e?.message || String(e)}) — skipping execution`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }

            const netAfterGas = await netProfitAfterGasUSD(executor, opp, tokenA);
            if (netAfterGas < MIN_NET_PROFIT_USD) {
                console.log(`  Net after gas $${netAfterGas.toFixed(2)} < $${MIN_NET_PROFIT_USD}, skipping`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }

            console.log(`  Executing flash loan (${forward.dex} → ${reverse.dex})… (net after gas ~$${netAfterGas.toFixed(2)})`);
            try {
                const result = await executor.executeFlashLoan(opp);
                if (result.success) {
                    console.log(`  ✅ EXECUTED: ${result.txHash} | net ~$${(result.netProfitUSD ?? 0).toFixed(2)}`);
                } else {
                    console.log(`  ❌ Execution failed: ${result.error}`);
                }
            } catch (e: any) {
                console.log(`  ❌ Execution error: ${e?.message || String(e)}`);
            }

            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        // -------- Single-pair mode (default) --------
        // Safety net: single mode computes the test amount at startup, but
        // recompute lazily so the loop can never read an unassigned value.
        // If the USD price is temporarily unavailable, skip this loop instead
        // of crashing the watcher.
        if (amountInSingle === undefined) {
            try {
                amountInSingle = await usdToTokenAmount(EFFECTIVE_TEST_AMOUNT_USD, WATCH_PAIR_A);
            } catch (e: any) {
                console.log(`  ⚠️ Cannot size amount for ${WATCH_PAIR_A.slice(0,6)} (${e?.message || String(e)}) — skipping loop`);
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }
        }
        const amountIn = amountInSingle;
        // Quote token A -> token B (buy) on every DEX
        const buyQuotes: { dex: string; q: QuoteResult }[] = [];

        for (const dex of dexProviders) {
            const qBuy = await quoteOn(dex, WATCH_PAIR_A, WATCH_PAIR_B, amountIn);
            if (qBuy) buyQuotes.push({ dex: dex.getDexName(), q: qBuy });

        }
        // Same outlier guard as multi-pair mode: drop stale/dust quotes so a
        // phantom spread cannot trigger a gas-burning execution attempt.
        const saneBuyQuotes = filterQuoteOutliers(buyQuotes, "buy");
        if (saneBuyQuotes.length < 2) {
            if (VERBOSE) console.log(`  [loop ${loop}] <2 sane buy quotes (${buyQuotes.length} raw) — skipping`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        if (VERBOSE) {
            console.log(`\n[loop ${loop}] Quotes (${WATCH_PAIR_A.slice(0,6)}→${WATCH_PAIR_B.slice(0,6)}):`);
            for (const { dex, q } of saneBuyQuotes) {
                console.log(`  ${dex}: ${formatAmount(q.amountOut, WATCH_PAIR_B)} ${WATCH_PAIR_B.slice(0,6)} (fee ${q.fee ?? "?"})`);
            }
        }

        // Compute cross-DEX round-trip: buy on DEX i, sell on DEX j, both with same amountIn
        let best: { spreadPct: number; netProfitUSD: number; forward: QuoteResult; reverse: QuoteResult } | null = null;

        // For a fair round-trip, buy at DEX i (A→B) with amountIn,
        // then sell the received B at DEX j (B→A). The sell amountOut is in token A.
        // We need sell quotes for the amount of B received from buy. Since we quoted B→A
        // with qBuy.amountOut on the SAME dex, that gives us the reverse on that dex. But for
        // cross-DEX we need buy on i → sell on j. To keep it correct with the data we have,
        // we approximate: use the sell quote on dex j for the amount of B that buy on i produced.
        // (In practice for monitoring, quoting both directions on each dex and comparing
        //  the implied rate is sufficient to detect large cross-DEX discrepancies.)
        for (const buy of saneBuyQuotes) {
            const sellQuotes: { dex: string; q: QuoteResult }[] = [];
            for (const sellDex of dexProviders) {
                if (buy.dex === sellDex.getDexName()) continue;
                const sellQuote = await quoteOn(sellDex, WATCH_PAIR_B, WATCH_PAIR_A, buy.q.amountOut);
                if (sellQuote) sellQuotes.push({ dex: sellDex.getDexName(), q: sellQuote });
            }
            for (const sell of filterQuoteOutliers(sellQuotes, "sell")) {
                const amountBack = sell.q.amountOut; // in token A
                if (amountBack <= amountIn) continue;

                const profit = amountBack - amountIn;
                const profitUSD = await tokenAmountToUsd(profit, WATCH_PAIR_A);
                const spreadPct = Number((profit * 1000000n) / amountIn) / 10000;

                if (VERBOSE) {
                    console.log(`  ${buy.dex}→${sell.dex}: ${formatAmount(amountBack, WATCH_PAIR_A)} back (${spreadPct.toFixed(3)}%)`);
                }

                if (!best || profitUSD > best.netProfitUSD) {
                    best = {
                        spreadPct,
                        netProfitUSD: profitUSD,
                        forward: buy.q,
                        reverse: sell.q
                    };
                }
            }
        }

        if (!best) {
            if (loop % 12 === 1) console.log(`[${new Date().toISOString()}] No cross-DEX round-trip profit on ${WATCH_PAIR_A.slice(0,6)}↔${WATCH_PAIR_B.slice(0,6)} (loop ${loop})`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        const { spreadPct, netProfitUSD, forward, reverse } = best;
        console.log(`\n[${new Date().toISOString()}] 🎯 Cross-DEX spread detected: ${forward.dex}→${reverse.dex} = ${spreadPct.toFixed(3)}% | net ~$${netProfitUSD.toFixed(2)}`);

        // Threshold check
        if (spreadPct < SPREAD_THRESHOLD_PCT) {
            if (VERBOSE) console.log(`  Below threshold ${SPREAD_THRESHOLD_PCT}%, skipping`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        if (netProfitUSD < MIN_NET_PROFIT_USD) {
            console.log(`  Net profit $${netProfitUSD.toFixed(2)} < $${MIN_NET_PROFIT_USD}, skipping`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        if (!executor) {
            console.log("  ⚠️ Execution not configured — would execute but watch-only mode.");
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        // Build opportunity & execute
        const profit = reverse.amountOut - amountIn;
        const opp = await buildOpportunity(forward, reverse, WATCH_PAIR_A, amountIn, profit, adapterRegistry!);

        // Validate route on-chain before spending gas (non-fatal if it fails)
        try {
            const ok = await engineContract!.validateRoute(opp.route, WATCH_PAIR_A);
            if (!ok) {
                console.log("  ⚠️ validateRoute returned false — skipping execution");
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }
        } catch (e: any) {
            console.log(`  ⚠️ validateRoute failed (${e?.message || String(e)}) — skipping execution`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        const netAfterGas = await netProfitAfterGasUSD(executor, opp, WATCH_PAIR_A);
        if (netAfterGas < MIN_NET_PROFIT_USD) {
            console.log(`  Net after gas $${netAfterGas.toFixed(2)} < $${MIN_NET_PROFIT_USD}, skipping`);
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
            continue;
        }

        console.log(`  Executing flash loan (${forward.dex} → ${reverse.dex})… (net after gas ~$${netAfterGas.toFixed(2)})`);
        try {
            const result = await executor.executeFlashLoan(opp);
            if (result.success) {
                console.log(`  ✅ EXECUTED: ${result.txHash} | net ~$${(result.netProfitUSD ?? 0).toFixed(2)}`);
            } else {
                console.log(`  ❌ Execution failed: ${result.error}`);
            }
        } catch (e: any) {
            console.log(`  ❌ Execution error: ${e?.message || String(e)}`);
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
}

main().catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
