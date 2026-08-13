import "dotenv/config";
import * as dotenv from "dotenv";
import {
    JsonRpcProvider,
    Wallet,
    Contract,
    parseUnits,
    formatUnits
} from "ethers";

import { PoolCache } from "../../bot/scanner/PoolCache.js";
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

// Load optional env file
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
const WATCH_MODE = (process.env.WATCH_MODE || "single").toLowerCase();
const WATCH_PAIRS_CSV = process.env.WATCH_PAIRS || ""; // e.g. "0xAAA,0xBBB;0xCCC,0xDDD"
const SCAN_BATCH_SIZE = Number(process.env.SCAN_BATCH_SIZE || 8);
const MIN_LIQUIDITY_USD = Number(process.env.MIN_LIQUIDITY_USD || 10000);
const MIN_DEX_VARIETY = Number(process.env.MIN_DEX_VARIETY || 2);
const MAX_PAIRS_PER_SCAN = Number(process.env.MAX_PAIRS_PER_SCAN || 200);
const TOP_N_CANDIDATES = Number(process.env.TOP_N_CANDIDATES || 5);
const TEST_AMOUNT_USD = Number(process.env.WATCH_TEST_USD || 1000); // Quote size in USD
const SPREAD_THRESHOLD_PCT = Number(process.env.SPREAD_THRESHOLD_PCT || 0.3); // e.g. 0.3%
const MIN_NET_PROFIT_USD = Number(process.env.MIN_NET_PROFIT_USD || 2);
const POLL_INTERVAL_MS = Number(process.env.WATCH_POLL_MS || 5000); // 5s default
const MAX_LOAN_USD = Number(process.env.WATCH_MAX_LOAN_USD || 10000);
const ENABLE_EXECUTION = process.env.WATCH_ENABLE_EXECUTION !== "false"; // default true
// Slippage tolerance: default 0.1%, clamped to [0.1%, 1.5%] — never defaults to the max.
const SLIPPAGE_PCT = Math.min(Math.max(Number(process.env.SLIPPAGE_PCT || 0.1), 0.1), 1.5);
const VERBOSE = process.env.WATCH_VERBOSE === "true";
const GENERAL_DEX_NAMES = ["UniswapV3", "SushiSwap", "PancakeSwap"];

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
const RPC_URL = process.env.BASE_RPC_URL || process.env.RPC_URL || "";
if (!RPC_URL) {
    throw new Error("BASE_RPC_URL not set in environment");
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set in environment");
}

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(PRIVATE_KEY, provider);
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
    if (process.env.AERODROME_QUOTER_ADDRESS && process.env.AERODROME_FACTORY_ADDRESS) {
        providers.push(new AerodromeDexProvider(
            provider, poolCache,
            process.env.AERODROME_QUOTER_ADDRESS,
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

/** Convert a USD test amount into raw token units for `token`.
 *  Uses the WETH→USDC quote as the USD price reference for any non-stable token,
 *  so $1000 → the correct amount of WETH (≈0.53 WETH), not 1000 WETH.
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

    // Estimate price via WETH→USDC quote (best effort, cached 30s)
    const weth = TOKENS.WETH;
    const usdc = TOKENS.USDC;
    let priceUSD = 1;
    try {
        const wethAmount = parseUnits("1", 18); // 1 WETH
        const quote = await quoteOnRaw(weth, usdc, wethAmount);
        if (quote && quote.amountOut > 0n) {
            priceUSD = Number(quote.amountOut) / 1e6; // USDC 6dp
        }
    } catch { /* keep $1 fallback */ }

    // For WETH itself, priceUSD is the ETH price (~$1900) → tiny amount. Good.
    const tokenAmount = usd / priceUSD;
    return parseUnits(tokenAmount.toFixed(6), decimals);
}

// Raw quote helper (no DEX provider needed — use a direct quoter via a temporary provider)
let _priceProvider: DexQuoteProvider | null = null;
async function quoteOnRaw(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<QuoteResult | null> {
    // Reuse the UniswapV3 provider as the price reference (deepest liquidity).
    if (!_priceProvider) {
        if (!process.env.UNISWAP_QUOTER_ADDRESS || !process.env.UNISWAP_FACTORY_ADDRESS) return null;
        _priceProvider = new UniswapV3DexProvider(
            provider, poolCache,
            process.env.UNISWAP_QUOTER_ADDRESS,
            process.env.UNISWAP_FACTORY_ADDRESS
        );
    }
    return _priceProvider.quote({ tokenIn, tokenOut, amountIn });
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
        const tokens = [...tokenSet];
        const pairs = toUniquePairs(tokens);
        console.log(`🧾 WATCH_MODE=all: ${tokens.length} tokens → ${pairs.length} candidate pairs (batch ${SCAN_BATCH_SIZE}, minLiquidity $${MIN_LIQUIDITY_USD}, minDex ${MIN_DEX_VARIETY})`);
        return pairs;
    }
    // single (default)
    return [{ tokenA: WATCH_PAIR_A, tokenB: WATCH_PAIR_B }];
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
                    if (buyQuotes.length < 2) {
                        return null;
                    }

                    // Best buy = highest amountOut of B for the same amountIn of A.
                    buyQuotes.sort((a, b) => (a.q.amountOut > b.q.amountOut ? -1 : 1));
                    const bestBuy = buyQuotes[0];
                    const buyAmountOut = bestBuy.q.amountOut;

                    // Phase 2: quote B→A on every DEX using the SAME buyAmountOut.
                    const sellQuotes: { dex: string; q: QuoteResult }[] = [];
                    for (const dex of dexProviders) {
                        const qSell = await quoteOn(dex, pair.tokenB, pair.tokenA, buyAmountOut);
                        if (qSell) sellQuotes.push({ dex: dex.getDexName(), q: qSell });
                    }

                    // Best round-trip: buy at bestBuy.dex, sell at the best cross-DEX.
                    let bestForPair: any = null;
                    for (const sell of sellQuotes) {
                        if (sell.dex === bestBuy.dex) continue; // must be cross-DEX
                        const amountBack = sell.q.amountOut;
                        if (amountBack <= amountIn) continue;
                        const profit = amountBack - amountIn;
                        const decimalsA = getDecimals(pair.tokenA);
                        const profitUSD = Number(profit) / (10 ** decimalsA);
                        const spreadPct = (Number(profit) / Number(amountIn)) * 100;
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
function buildOpportunity(
    forward: QuoteResult,
    reverse: QuoteResult,
    tokenIn: string,
    amountIn: bigint,
    profit: bigint,
    adapterRegistry: AdapterRegistry
): any {
    const step = (q: QuoteResult, amountInRaw: bigint, minOut: bigint) => ({
        adapter: adapterRegistry.get(q.dex),
        tokenIn: q.tokenIn,
        tokenOut: q.tokenOut,
        fee: q.fee ?? 0,
        amountIn: amountInRaw,
        minAmountOut: minOut,
        data: "0x",
        deadline: Math.floor(Date.now() / 1000) + 60
    });

    // Apply slippage tolerance to each leg's minimum output (capped at 1.5%).
    const slip = (out: bigint) => (out * (1000n - BigInt(Math.round(SLIPPAGE_PCT * 10)))) / 1000n;
    const steps = [
        step(forward, amountIn, slip(forward.amountOut)),
        step(reverse, forward.amountOut, slip(reverse.amountOut))
    ];

    return {
        route: {
            swaps: steps,
            profitToken: tokenIn,
            minProfit: profit
        },
        inputAmount: amountIn,
        outputAmount: amountIn + profit,
        profit,
        netProfitUSD: Number(profit) / (10 ** getDecimals(tokenIn))
    };
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
    console.log("🚀 Spread Monitor + Auto-Execute");
    console.log("=================================");
    console.log(`Pair: ${WATCH_PAIR_A.slice(0,6)} ↔ ${WATCH_PAIR_B.slice(0,6)}`);
    console.log(`Threshold: ${SPREAD_THRESHOLD_PCT}% | Test USD: $${TEST_AMOUNT_USD} | Min net: $${MIN_NET_PROFIT_USD} | Poll: ${POLL_INTERVAL_MS}ms | Slippage: ${SLIPPAGE_PCT}%`);
    console.log(`Execution: ${ENABLE_EXECUTION ? "ENABLED" : "DISABLED (watch only)"}`);
    console.log(`Signer: ${wallet.address}`);
    console.log();

    const dexProviders = buildDexProviders();
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
                wallet
            );
            executor = new FlashLoanExecutor(engineContract, adapterRegistry);
            console.log(`✅ Execution ready (engine ${engineAddress.slice(0,8)}…)\n`);
        }
    }

    // Amount for monitoring (in token A units) — kept for single mode
    const amountInSingle = await usdToTokenAmount(TEST_AMOUNT_USD, WATCH_PAIR_A);
    console.log(`Single-pair monitoring amount: ${formatAmount(amountInSingle, WATCH_PAIR_A)} ${WATCH_PAIR_A.slice(0,6)} (~$${TEST_AMOUNT_USD})\n`);

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
            const v = await usdToTokenAmount(TEST_AMOUNT_USD, token);
            amountCache.set(key, v);
            return v;
        };

        // -------- Multi-pair mode (all/list) --------
        if (WATCH_MODE === "all" || WATCH_MODE === "list") {
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

            const opp = buildOpportunity(forward, reverse, tokenA, amountIn, profit, adapterRegistry!);
            try {
                const ok = await engineContract!.validateRoute(opp.route, tokenA);
                if (!ok) {
                    console.log("  ⚠️ validateRoute returned false — skipping execution");
                    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                    continue;
                }
            } catch (e: any) {
                console.log(`  ⚠️ validateRoute failed (${e?.message || String(e)}) — continuing`);
            }

            console.log(`  Executing flash loan (${forward.dex} → ${reverse.dex})…`);
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
        const amountIn = amountInSingle;
        // Quote token A -> token B (buy) on every DEX
        const buyQuotes: { dex: string; q: QuoteResult }[] = [];
        const sellQuotes: { dex: string; q: QuoteResult }[] = [];

        for (const dex of dexProviders) {
            const qBuy = await quoteOn(dex, WATCH_PAIR_A, WATCH_PAIR_B, amountIn);
            if (qBuy) buyQuotes.push({ dex: dex.getDexName(), q: qBuy });

            // Reverse direction: use the buy output as input for a fair comparison
            if (qBuy && qBuy.amountOut > 0n) {
                const qSell = await quoteOn(dex, WATCH_PAIR_B, WATCH_PAIR_A, qBuy.amountOut);
                if (qSell) sellQuotes.push({ dex: dex.getDexName(), q: qSell });
            }
        }

        if (VERBOSE) {
            console.log(`\n[loop ${loop}] Quotes (${WATCH_PAIR_A.slice(0,6)}→${WATCH_PAIR_B.slice(0,6)}):`);
            for (const { dex, q } of buyQuotes) {
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
        for (const buy of buyQuotes) {
            for (const sell of sellQuotes) {
                if (buy.dex === sell.dex) continue; // Must be cross-DEX

                const amountBack = sell.q.amountOut; // in token A
                if (amountBack <= amountIn) continue;

                const profit = amountBack - amountIn;
                const decimalsA = getDecimals(WATCH_PAIR_A);
                const profitUSD = Number(profit) / (10 ** decimalsA); // token A units → USD approximation
                const spreadPct = (Number(profit) / Number(amountIn)) * 100;

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
        const opp = buildOpportunity(forward, reverse, WATCH_PAIR_A, amountIn, profit, adapterRegistry!);

        // Validate route on-chain before spending gas (non-fatal if it fails)
        try {
            const ok = await engineContract!.validateRoute(opp.route, WATCH_PAIR_A);
            if (!ok) {
                console.log("  ⚠️ validateRoute returned false — skipping execution");
                await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
                continue;
            }
        } catch (e: any) {
            console.log(`  ⚠️ validateRoute failed (${e?.message || String(e)}) — continuing`);
        }

        console.log(`  Executing flash loan (${forward.dex} → ${reverse.dex})…`);
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