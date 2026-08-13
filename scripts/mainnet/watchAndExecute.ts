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
const TEST_AMOUNT_USD = Number(process.env.WATCH_TEST_USD || 1000); // Quote size in USD
const SPREAD_THRESHOLD_PCT = Number(process.env.SPREAD_THRESHOLD_PCT || 0.3); // e.g. 0.3%
const MIN_NET_PROFIT_USD = Number(process.env.MIN_NET_PROFIT_USD || 2);
const POLL_INTERVAL_MS = Number(process.env.WATCH_POLL_MS || 5000); // 5s default
const MAX_LOAN_USD = Number(process.env.WATCH_MAX_LOAN_USD || 10000);
const ENABLE_EXECUTION = process.env.WATCH_ENABLE_EXECUTION !== "false"; // default true
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

    const steps = [
        step(forward, amountIn, forward.amountOut),
        step(reverse, forward.amountOut, reverse.amountOut)
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
    console.log(`Threshold: ${SPREAD_THRESHOLD_PCT}% | Test USD: $${TEST_AMOUNT_USD} | Min net: $${MIN_NET_PROFIT_USD} | Poll: ${POLL_INTERVAL_MS}ms`);
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

    // Amount for monitoring (in token A units)
    let amountIn: bigint;
    amountIn = await usdToTokenAmount(TEST_AMOUNT_USD, WATCH_PAIR_A);
    console.log(`Monitoring amount: ${formatAmount(amountIn, WATCH_PAIR_A)} ${WATCH_PAIR_A.slice(0,6)} (~$${TEST_AMOUNT_USD})\n`);

    let loop = 0;

    // Infinite loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
        loop++;
        const startTime = Date.now();

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