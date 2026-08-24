#!/usr/bin/env node
/**
 * Morpho Arbitrage Bot — MCP server.
 *
 * Read-only Model Context Protocol interface over the bot's existing DEX quote
 * providers, so an AI agent can discover and price cross-DEX arbitrage on Base
 * with the same accuracy as the watcher (correct decimals, live USD prices,
 * L1+L2 gas). No private key is used and no transaction is ever sent.
 *
 * Run: npm run mcp
 */

import * as dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
    Contract,
    FallbackProvider,
    JsonRpcProvider,
    Transaction,
    formatUnits,
    getAddress,
    parseEther,
    parseUnits,
} from "ethers";

import { PoolCache } from "../scanner/PoolCache.js";
import { UniswapV3DexProvider } from "../scanner/quote/UniswapV3DexProvider.js";
import { SushiSwapDexProvider } from "../scanner/quote/SushiSwapDexProvider.js";
import { PancakeSwapDexProvider } from "../scanner/quote/PancakeSwapDexProvider.js";
import { AerodromeDexProvider } from "../scanner/quote/AerodromeDexProvider.js";
import { DexQuoteProvider } from "../scanner/quote/DexQuoteProvider.js";
import { QuoteRequest, QuoteResult } from "../scanner/quote/index.js";
import { TOKEN_DECIMALS, TOKENS, tokenSymbol } from "../scanner/TokenList.js";
import { getTrendingBaseTokens } from "../scanner/DexScreenerClient.js";
import { estimateGasLimit as estimateGasLimitPure } from "../strategy/arbMath.js";

// ------------------------------------------------------------------
// Config
// ------------------------------------------------------------------

// MCP speaks JSON-RPC over stdio, so stdout must stay clean. dotenv v17 prints
// a third-party promo line to stdout on load — silence it or the protocol breaks.
const dotenvOptions = { path: process.env.ENV_FILE ?? ".env.mainnet", quiet: true };
dotenv.config(dotenvOptions);

const RPC_URLS = [...new Set([
    process.env.BASE_RPC_URL_1 || process.env.BASE_RPC_URL || process.env.RPC_URL,
    process.env.BASE_RPC_URL_2,
].filter((u): u is string => Boolean(u)))];
if (RPC_URLS.length === 0) {
    throw new Error("BASE_RPC_URL not set in environment");
}

const rpcProviders = RPC_URLS.map(url => new JsonRpcProvider(url));
const provider = rpcProviders.length > 1
    ? new FallbackProvider(rpcProviders.map((rpc, i) => ({
        provider: rpc, priority: i + 1, stallTimeout: 1500, weight: 1,
    })))
    : rpcProviders[0];

const poolCache = new PoolCache();

// OP GasPriceOracle on Base for the L1 data-fee component of a tx.
const OP_GAS_ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";
const OP_GAS_ORACLE_ABI = ["function getL1Fee(bytes data) view returns (uint256)"];

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
];

// Morpho flash loans charge 0 fee — the reference repo's 0.09% Aave fee does
// not apply here, which is exactly why net-profit numbers differ (ours higher).
const FLASH_LOAN_FEE_BPS = 0;

// ------------------------------------------------------------------
// DEX providers (same wiring as the watcher)
// ------------------------------------------------------------------

function buildDexProviders(): DexQuoteProvider[] {
    const providers: DexQuoteProvider[] = [];
    if (process.env.UNISWAP_QUOTER_ADDRESS && process.env.UNISWAP_FACTORY_ADDRESS) {
        providers.push(new UniswapV3DexProvider(
            provider, poolCache,
            process.env.UNISWAP_QUOTER_ADDRESS, process.env.UNISWAP_FACTORY_ADDRESS));
    }
    if (process.env.SUSHISWAP_QUOTER_ADDRESS && process.env.SUSHISWAP_FACTORY_ADDRESS) {
        providers.push(new SushiSwapDexProvider(
            provider, poolCache,
            process.env.SUSHISWAP_QUOTER_ADDRESS, process.env.SUSHISWAP_FACTORY_ADDRESS));
    }
    if (process.env.PANCAKESWAP_QUOTER_ADDRESS && process.env.PANCAKESWAP_FACTORY_ADDRESS) {
        providers.push(new PancakeSwapDexProvider(
            provider, poolCache,
            process.env.PANCAKESWAP_QUOTER_ADDRESS, process.env.PANCAKESWAP_FACTORY_ADDRESS));
    }
    const aerodromeRouter = process.env.AERODROME_ROUTER_ADDRESS || process.env.AERODROME_ROUTER;
    if (aerodromeRouter && process.env.AERODROME_FACTORY_ADDRESS) {
        providers.push(new AerodromeDexProvider(
            provider, poolCache, aerodromeRouter, process.env.AERODROME_FACTORY_ADDRESS));
    }
    return providers;
}

const dexProviders = buildDexProviders();

/**
 * Public Base RPC endpoints rate-limit concurrent quoter calls, which makes
 * individual DEX providers intermittently return null. Retry once with a small
 * backoff so a single slow/flaky provider does not drop a whole DEX route.
 */
async function quoteWithRetry(p: DexQuoteProvider, request: QuoteRequest): Promise<QuoteResult | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const q = await p.quote(request);
            if (q && q.amountOut > 0n) return q;
        } catch { /* fall through to retry */ }
        if (attempt === 0) await new Promise(r => setTimeout(r, 250));
    }
    return null;
}

async function quoteAll(request: QuoteRequest): Promise<QuoteResult[]> {
    const results = await Promise.all(dexProviders.map(p => quoteWithRetry(p, request)));
    return results.filter((q): q is QuoteResult => q !== null);
}

// ------------------------------------------------------------------
// Token metadata & USD pricing
// ------------------------------------------------------------------

const decimalsCache = new Map<string, number>();
async function getDecimals(address: string): Promise<number> {
    const key = address.toLowerCase();
    if (decimalsCache.has(key)) return decimalsCache.get(key)!;
    const known = TOKEN_DECIMALS[key];
    if (known !== undefined) { decimalsCache.set(key, known); return known; }
    try {
        const dec = Number(await new Contract(address, ERC20_ABI, provider).decimals());
        decimalsCache.set(key, dec);
        return dec;
    } catch {
        return 18;
    }
}

const symbolCache = new Map<string, string>();
async function getSymbol(address: string): Promise<string> {
    const key = address.toLowerCase();
    if (symbolCache.has(key)) return symbolCache.get(key)!;
    const known = tokenSymbol(address);
    if (!known.includes("…")) { symbolCache.set(key, known); return known; }
    try {
        const sym: string = await new Contract(address, ERC20_ABI, provider).symbol();
        symbolCache.set(key, sym);
        return sym;
    } catch {
        return known;
    }
}

const STABLE_LIKE = new Set([
    TOKENS.USDC, TOKENS.USDT, TOKENS.DAI, TOKENS.USDe, TOKENS.RLUSD, TOKENS.EURC,
].map(t => t.toLowerCase()));

const usdPriceCache = new Map<string, { price: number; expiresAt: number }>();
const USD_PRICE_TTL_MS = 30_000;

/** Live USD price: median of token→USDC quotes across every enabled DEX. */
async function tokenUsdPrice(token: string): Promise<number> {
    const lower = token.toLowerCase();
    if (STABLE_LIKE.has(lower)) return 1;
    const cached = usdPriceCache.get(lower);
    if (cached && cached.expiresAt > Date.now()) return cached.price;

    const prices: number[] = [];
    const oneUnit = parseUnits("1", await getDecimals(token));
    const usdcDecimals = await getDecimals(TOKENS.USDC);
    for (const p of dexProviders) {
        try {
            const q = await p.quote({ tokenIn: token, tokenOut: TOKENS.USDC, amountIn: oneUnit });
            if (q && q.amountOut > 0n) prices.push(Number(formatUnits(q.amountOut, usdcDecimals)));
        } catch { /* skip */ }
    }
    if (prices.length === 0) return 0;
    prices.sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    usdPriceCache.set(lower, { price: median, expiresAt: Date.now() + USD_PRICE_TTL_MS });
    return median;
}

// ------------------------------------------------------------------
// Gas: L2 execution fee + L1 data fee via the OP GasPriceOracle
// ------------------------------------------------------------------

async function estimateGasWei(): Promise<{ totalWei: bigint; l2Wei: bigint; l1Wei: bigint }> {
    // A 2-swap flash round trip is the typical arb shape here.
    const gasLimit = (estimateGasLimitPure(2, 0) * 120n) / 100n;
    const feeData = await provider.getFeeData();
    const gasPrice = (feeData.gasPrice ?? parseUnits("0.1", "gwei")) * 120n / 100n;
    const l2Wei = gasPrice * gasLimit;

    let l1Wei = 0n;
    try {
        // Dummy tx carrying typical executeArbitrage-sized calldata so the
        // oracle prices realistic L1 calldata bytes.
        const dummyTx = Transaction.from({
            type: 2, chainId: 8453, nonce: 0,
            to: TOKENS.WETH,
            data: `0x${"ab".repeat(360)}`,
            gasLimit, maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice,
        });
        dummyTx.signature = `0x${"aa".repeat(32)}${"11".repeat(32)}1b`;
        const oracle = new Contract(OP_GAS_ORACLE_ADDRESS, OP_GAS_ORACLE_ABI, provider);
        l1Wei = await oracle.getL1Fee(dummyTx.serialized);
    } catch {
        l1Wei = 0n;
    }
    const totalWei = l1Wei > 0n ? l2Wei + l1Wei : l2Wei + l2Wei / 4n;
    return { totalWei, l2Wei, l1Wei };
}

// ------------------------------------------------------------------
// Response helpers
// ------------------------------------------------------------------

function ok(payload: unknown) {
    return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
function err(msg: string) {
    return { content: [{ type: "text" as const, text: msg }], isError: true as const };
}

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address");

interface ArbLeg {
    buyDex: string;
    sellDex: string;
    buyPool: string;
    sellPool: string;
    grossProfitToken: string;
    flashFeeToken: string;
    gasToken: string;
    netProfitToken: string;
    netProfitUsd: number;
    profitBps: number;
    profitable: boolean;
}

/**
 * Core cross-DEX round trip for one token against a quote currency (WETH or
 * USDC): buy token where cheapest, sell where most expensive. Morpho flash
 * loan fee is 0, so net = gross - gas only.
 */
async function evaluateRoundTrip(
    token: string,
    quoteCurrency: string,
    amountIn: bigint,
    minProfitBps: number,
): Promise<{ legs: ArbLeg[]; buyQuotes: QuoteResult[]; sellQuotes: QuoteResult[] }> {
    const buyQuotes = await quoteAll({ tokenIn: quoteCurrency, tokenOut: token, amountIn });
    if (buyQuotes.length < 2) return { legs: [], buyQuotes, sellQuotes: [] };
    buyQuotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
    const bestBuy = buyQuotes[0];

    const sellQuotes = await quoteAll({ tokenIn: token, tokenOut: quoteCurrency, amountIn: bestBuy.amountOut });

    const gas = await estimateGasWei();
    const quoteDecimals = await getDecimals(quoteCurrency);
    const gasEth = Number(formatUnits(gas.totalWei, 18));
    const quoteUsd = await tokenUsdPrice(quoteCurrency);
    const isWethQuote = quoteCurrency.toLowerCase() === TOKENS.WETH.toLowerCase();
    // Convert the gas cost (always in ETH) into the quote currency.
    const ethUsd = isWethQuote ? quoteUsd : await tokenUsdPrice(TOKENS.WETH);
    const gasInQuote = isWethQuote || ethUsd === 0 || quoteUsd === 0
        ? gasEth
        : gasEth * ethUsd / quoteUsd;

    const legs: ArbLeg[] = [];
    for (const sell of sellQuotes) {
        if (sell.dex === bestBuy.dex) continue;
        const grossWei = sell.amountOut - amountIn;
        const profitBps = amountIn > 0n ? Number((grossWei * 10000n) / amountIn) : 0;
        if (profitBps < minProfitBps) continue;

        const flashFeeToken = (Number(formatUnits(amountIn, quoteDecimals)) * FLASH_LOAN_FEE_BPS) / 10_000;
        const grossToken = Number(formatUnits(grossWei, quoteDecimals));
        const netToken = grossToken - flashFeeToken - gasInQuote;

        legs.push({
            buyDex: bestBuy.dex,
            sellDex: sell.dex,
            buyPool: bestBuy.pool,
            sellPool: sell.pool,
            grossProfitToken: grossToken.toFixed(6),
            flashFeeToken: flashFeeToken.toFixed(6),
            gasToken: gasInQuote.toFixed(6),
            netProfitToken: netToken.toFixed(6),
            netProfitUsd: netToken * quoteUsd,
            profitBps,
            profitable: netToken > 0,
        });
    }
    legs.sort((a, b) => b.netProfitUsd - a.netProfitUsd);
    return { legs, buyQuotes, sellQuotes };
}

// ------------------------------------------------------------------
// MCP server
// ------------------------------------------------------------------

const server = new McpServer({ name: "morpho-arbitrage-bot", version: "2.0.0" });

// Tool 1: detect_arb_opportunity
server.tool(
    "detect_arb_opportunity",
    "Compare live quotes across Uniswap V3, SushiSwap, PancakeSwap V3 and Aerodrome on Base and return profitable cross-DEX round trips for one token. Uses correct token decimals, live USD prices and L1+L2 gas. Morpho flash-loan fee is 0%.",
    {
        token_address: addressSchema.describe("Token contract address on Base"),
        quote_currency: z.enum(["WETH", "USDC"]).default("WETH").describe("Quote currency for the round trip"),
        amount_eth: z.string().default("0.01").describe("Test amount of the quote currency (e.g. 0.01 WETH)"),
        min_profit_bps: z.number().default(30).describe("Minimum gross profit in basis points to report"),
    },
    async ({ token_address, quote_currency, amount_eth, min_profit_bps }) => {
        try {
            const token = getAddress(token_address);
            const quoteAddr = quote_currency === "WETH" ? TOKENS.WETH : TOKENS.USDC;
            const quoteDecimals = await getDecimals(quoteAddr);
            const amountIn = parseUnits(amount_eth, quoteDecimals);
            const symbol = await getSymbol(token);

            const { legs, buyQuotes } = await evaluateRoundTrip(token, quoteAddr, amountIn, min_profit_bps);
            if (buyQuotes.length < 2) {
                return ok({
                    token, symbol, result: "INSUFFICIENT_ROUTES",
                    message: `Only ${buyQuotes.length} DEX route(s) found. Need at least 2 for cross-DEX arb.`,
                    availableRoutes: buyQuotes.map(q => q.dex),
                });
            }
            return ok({
                token, symbol, quoteCurrency: quote_currency, testAmount: amount_eth,
                routesChecked: buyQuotes.length,
                opportunitiesFound: legs.length,
                flashLoanFeeBps: FLASH_LOAN_FEE_BPS,
                opportunities: legs,
                allBuyQuotes: buyQuotes.map(q => ({ dex: q.dex, pool: q.pool, amountOut: q.amountOut.toString() })),
            });
        } catch (e) {
            return err(`Error detecting arb: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// Tool 2: get_price_across_dexes
server.tool(
    "get_price_across_dexes",
    "Get the current price of a token on every enabled DEX (Uniswap V3, SushiSwap, PancakeSwap V3, Aerodrome) plus the cross-DEX spread in basis points and a live USD reference price.",
    {
        token_address: addressSchema.describe("Token contract address on Base"),
        quote_currency: z.enum(["WETH", "USDC"]).default("WETH").describe("Quote currency"),
        amount_eth: z.string().default("0.01").describe("Test amount of the quote currency"),
    },
    async ({ token_address, quote_currency, amount_eth }) => {
        try {
            const token = getAddress(token_address);
            const quoteAddr = quote_currency === "WETH" ? TOKENS.WETH : TOKENS.USDC;
            const [symbol, tokenDecimals, quoteDecimals] = await Promise.all([
                getSymbol(token), getDecimals(token), getDecimals(quoteAddr)]);
            const amountIn = parseUnits(amount_eth, quoteDecimals);

            const quotes = await quoteAll({ tokenIn: quoteAddr, tokenOut: token, amountIn });
            if (quotes.length === 0) {
                return ok({ token, symbol, result: "NO_QUOTES", message: "No DEX returned a quote for this pair." });
            }
            const usdPrice = await tokenUsdPrice(token);

            const prices = quotes.map(q => {
                const tokensOut = Number(formatUnits(q.amountOut, tokenDecimals));
                const quoteIn = Number(formatUnits(amountIn, quoteDecimals));
                return {
                    dex: q.dex, pool: q.pool,
                    tokensPerQuote: tokensOut > 0 ? (tokensOut / quoteIn).toFixed(6) : "0",
                    pricePerTokenQuote: tokensOut > 0 ? (quoteIn / tokensOut).toFixed(10) : "0",
                };
            });
            const values = prices.map(p => parseFloat(p.pricePerTokenQuote)).filter(v => v > 0);
            const min = Math.min(...values), max = Math.max(...values);
            const spreadBps = min > 0 ? Math.round(((max - min) / min) * 10_000) : 0;

            return ok({
                token, symbol, quoteCurrency: quote_currency, testAmount: amount_eth,
                dexCount: prices.length, spreadBps,
                usdPrice: usdPrice > 0 ? usdPrice.toFixed(6) : null,
                prices,
            });
        } catch (e) {
            return err(`Error getting prices: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// Tool 3: get_pool_reserves
server.tool(
    "get_pool_reserves",
    "Get reserve/liquidity info for a token's pools on Base. Reads WETH and USDC pairs from on-chain factories (Aerodrome volatile+stable, Uniswap V3 fee tiers) and reports reserves for constant-product pools.",
    {
        token_address: addressSchema.describe("Token contract address on Base"),
    },
    async ({ token_address }) => {
        try {
            const token = getAddress(token_address);
            const symbol = await getSymbol(token);
            const tokenDecimals = await getDecimals(token);
            const bases = [
                { label: "WETH", addr: TOKENS.WETH, decimals: 18 },
                { label: "USDC", addr: TOKENS.USDC, decimals: 6 },
            ];

            const pools: Record<string, unknown>[] = [];
            // Aerodrome volatile + stable against both bases.
            const aeroFactory = process.env.AERODROME_FACTORY_ADDRESS;
            if (aeroFactory) {
                const factory = new Contract(aeroFactory,
                    ["function getPool(address,address,bool) view returns (address)"], provider);
                for (const base of bases) {
                    for (const stable of [false, true]) {
                        try {
                            const poolAddr: string = await factory.getPool(token, base.addr, stable);
                            if (!poolAddr || poolAddr === "0x0000000000000000000000000000000000000000") continue;
                            const pair = new Contract(poolAddr, [
                                "function getReserves() view returns (uint256,uint256,uint256)",
                                "function token0() view returns (address)",
                            ], provider);
                            const [r0, r1] = await pair.getReserves();
                            const t0: string = await pair.token0();
                            const isToken0 = (t0 as string).toLowerCase() === token.toLowerCase();
                            pools.push({
                                dex: `Aerodrome (${stable ? "stable" : "volatile"})`,
                                pool: poolAddr,
                                pair: `${symbol}/${base.label}`,
                                tokenReserve: formatUnits(isToken0 ? r0 : r1, tokenDecimals),
                                baseReserve: formatUnits(isToken0 ? r1 : r0, base.decimals),
                                base: base.label,
                            });
                        } catch { /* pool missing */ }
                    }
                }
            }
            // Uniswap V3 fee tiers (concentrated liquidity — report state, not reserves).
            const uniFactory = process.env.UNISWAP_FACTORY_ADDRESS;
            if (uniFactory) {
                const factory = new Contract(uniFactory,
                    ["function getPool(address,address,uint24) view returns (address)"], provider);
                for (const base of bases) {
                    for (const fee of [100, 500, 3000, 10000]) {
                        try {
                            const poolAddr: string = await factory.getPool(token, base.addr, fee);
                            if (!poolAddr || poolAddr === "0x0000000000000000000000000000000000000000") continue;
                            const pool = new Contract(poolAddr, [
                                "function liquidity() view returns (uint128)",
                                "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
                            ], provider);
                            const [liquidity, slot0] = await Promise.all([pool.liquidity(), pool.slot0()]);
                            pools.push({
                                dex: `Uniswap V3 (${fee / 10000}%)`,
                                pool: poolAddr,
                                pair: `${symbol}/${base.label}`,
                                liquidity: liquidity.toString(),
                                tick: Number(slot0.tick),
                                note: "concentrated liquidity — no constant-product reserves",
                            });
                        } catch { /* pool missing */ }
                    }
                }
            }

            return ok({ token, symbol, poolsFound: pools.length, pools });
        } catch (e) {
            return err(`Error fetching pools: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// Tool 4: estimate_flash_profit
server.tool(
    "estimate_flash_profit",
    "Estimate the net profit of a Morpho flash-loan arbitrage for a token. Picks the best buy and sell DEX automatically from live quotes. Accounts for L1+L2 gas and the 0% Morpho flash fee.",
    {
        token_address: addressSchema.describe("Token contract address on Base"),
        loan_amount_eth: z.string().default("1.0").describe("Flash loan amount in WETH"),
    },
    async ({ token_address, loan_amount_eth }) => {
        try {
            const token = getAddress(token_address);
            const symbol = await getSymbol(token);
            const loanWei = parseEther(loan_amount_eth);

            const buyQuotes = await quoteAll({ tokenIn: TOKENS.WETH, tokenOut: token, amountIn: loanWei });
            if (buyQuotes.length < 2) {
                return ok({
                    token, symbol, result: "INSUFFICIENT_ROUTES",
                    message: `Only ${buyQuotes.length} DEX route(s). Need at least 2.`,
                });
            }
            buyQuotes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
            const bestBuy = buyQuotes[0];
            const sellQuotes = await quoteAll({ tokenIn: token, tokenOut: TOKENS.WETH, amountIn: bestBuy.amountOut });
            const bestSell = sellQuotes.filter(q => q.dex !== bestBuy.dex)
                .sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1))[0];
            if (!bestSell) {
                return ok({ token, symbol, result: "NO_DISJOINT_ROUTE", message: "No sell route on a different DEX than the best buy route." });
            }

            const gas = await estimateGasWei();
            const ethUsd = await tokenUsdPrice(TOKENS.WETH);
            const grossWei = bestSell.amountOut - loanWei;
            const netWei = grossWei - gas.totalWei; // Morpho flash fee = 0
            const profitBps = loanWei > 0n ? Number((grossWei * 10000n) / loanWei) : 0;

            return ok({
                token, symbol,
                loanAmountWeth: loan_amount_eth,
                buyOn: bestBuy.dex, buyPool: bestBuy.pool,
                sellOn: bestSell.dex, sellPool: bestSell.pool,
                tokensReceived: formatUnits(bestBuy.amountOut, await getDecimals(token)),
                wethOut: formatUnits(bestSell.amountOut, 18),
                grossProfitWeth: formatUnits(grossWei, 18),
                flashLoanFeeWeth: "0 (Morpho)",
                gasCostWeth: formatUnits(gas.totalWei, 18),
                netProfitWeth: formatUnits(netWei, 18),
                netProfitUsd: (Number(formatUnits(netWei, 18)) * ethUsd).toFixed(4),
                profitBps,
                profitable: netWei > 0n,
                warning: "Quote-based estimate at current reserves. Real execution shifts price (slippage); the on-chain engine enforces minProfit before settling.",
            });
        } catch (e) {
            return err(`Error estimating flash profit: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// Tool 5: scan_top_tokens
server.tool(
    "scan_top_tokens",
    "Discover trending Base tokens via DexScreener and scan each for cross-DEX arbitrage using the bot's live quote providers. Returns tokens ranked by best net opportunity.",
    {
        min_liquidity_usd: z.number().default(50_000).describe("Minimum aggregate liquidity in USD"),
        limit: z.number().default(15).describe("Max tokens to scan"),
        quote_currency: z.enum(["WETH", "USDC"]).default("WETH").describe("Quote currency for round trips"),
        test_amount: z.string().default("0.01").describe("Test amount of the quote currency per scan"),
    },
    async ({ min_liquidity_usd, limit, quote_currency, test_amount }) => {
        try {
            const quoteAddr = quote_currency === "WETH" ? TOKENS.WETH : TOKENS.USDC;
            const quoteDecimals = await getDecimals(quoteAddr);
            const amountIn = parseUnits(test_amount, quoteDecimals);

            const trending = await getTrendingBaseTokens(limit * 2);
            const candidates = trending.filter(t => t.liquidityUsd >= min_liquidity_usd).slice(0, limit);

            const results = [];
            for (const t of candidates) {
                try {
                    const { legs } = await evaluateRoundTrip(t.address, quoteAddr, amountIn, 0);
                    const best = legs[0];
                    results.push({
                        address: t.address, symbol: t.symbol,
                        liquidityUsd: Math.round(t.liquidityUsd),
                        volume24hUsd: Math.round(t.volume24hUsd),
                        source: t.source,
                        arbFound: Boolean(best?.profitable),
                        bestNetProfitUsd: best ? Number(best.netProfitUsd.toFixed(4)) : 0,
                        bestProfitBps: best?.profitBps ?? 0,
                        bestRoute: best ? `${best.buyDex} -> ${best.sellDex}` : "none",
                    });
                } catch {
                    results.push({
                        address: t.address, symbol: t.symbol,
                        liquidityUsd: Math.round(t.liquidityUsd),
                        volume24hUsd: Math.round(t.volume24hUsd),
                        source: t.source, arbFound: false,
                        bestNetProfitUsd: 0, bestProfitBps: 0, bestRoute: "none", reason: "error",
                    });
                }
            }
            results.sort((a, b) => b.bestNetProfitUsd - a.bestNetProfitUsd);

            return ok({
                scanned: results.length,
                candidatesFromDiscovery: trending.length,
                minLiquidityUsd: min_liquidity_usd,
                tokensWithArb: results.filter(r => r.arbFound).length,
                results,
            });
        } catch (e) {
            return err(`Error scanning tokens: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// Tool 6: get_token_discovery
server.tool(
    "get_token_discovery",
    "List trending/new Base tokens from DexScreener (boosts + latest profiles) with liquidity, volume and price. Pure discovery feed — use scan_top_tokens to also price arb opportunities for them.",
    {
        limit: z.number().default(20).describe("Max tokens to return"),
    },
    async ({ limit }) => {
        try {
            const tokens = await getTrendingBaseTokens(limit);
            return ok({
                count: tokens.length,
                tokens: tokens.map(t => ({
                    address: t.address, symbol: t.symbol, name: t.name,
                    source: t.source,
                    liquidityUsd: Math.round(t.liquidityUsd),
                    volume24hUsd: Math.round(t.volume24hUsd),
                    txns24h: t.txns24h,
                    priceUsd: t.priceUsd,
                    pairCount: t.pairCount,
                })),
            });
        } catch (e) {
            return err(`Error in discovery: ${e instanceof Error ? e.message : String(e)}`);
        }
    },
);

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[mcp] morpho-arbitrage-bot MCP server running (providers: ${dexProviders.map(p => p.getDexName()).join(", ") || "none"})`);
}

main().catch(e => {
    console.error("Fatal error:", e);
    process.exit(1);
});
