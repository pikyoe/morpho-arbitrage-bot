import { test } from "node:test";
import assert from "node:assert/strict";
import {
    filterQuoteOutliers,
    spreadThresholdForDexes,
    estimateGasLimit,
    routeCooldownKey,
    isInCooldown,
    parseWatchPairsCsv
} from "../bot/strategy/arbMath.js";

const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";

test("filterQuoteOutliers keeps all when fewer than 3 quotes", () => {
    const quotes = [
        { q: { amountOut: 100n } },
        { q: { amountOut: 50_000n } } // extreme, but only 2 quotes → no filtering
    ];
    assert.equal(filterQuoteOutliers(quotes).length, 2);
});

test("filterQuoteOutliers drops a wild outlier, keeps the cluster", () => {
    const quotes = [
        { q: { amountOut: 1000n } },
        { q: { amountOut: 1010n } },
        { q: { amountOut: 990n } },
        { q: { amountOut: 1005n } },
        { q: { amountOut: 10_000_000n } } // stale/garbage quote
    ];
    const kept = filterQuoteOutliers(quotes);
    assert.equal(kept.length, 4);
    assert.ok(kept.every(x => x.q.amountOut < 10_000n));
});

test("filterQuoteOutliers invokes onDrop with removal stats", () => {
    const quotes = [
        { q: { amountOut: 1000n } },
        { q: { amountOut: 1010n } },
        { q: { amountOut: 990n } },
        { q: { amountOut: 1005n } },
        { q: { amountOut: 5_000_000n } }
    ];
    let removed = -1;
    filterQuoteOutliers(quotes, r => { removed = r; });
    assert.equal(removed, 1);
});

test("filterQuoteOutliers is stable when there is no outlier", () => {
    const quotes = [
        { q: { amountOut: 1000n } },
        { q: { amountOut: 1001n } },
        { q: { amountOut: 999n } },
        { q: { amountOut: 1002n } }
    ];
    assert.equal(filterQuoteOutliers(quotes).length, 4);
});

test("spreadThresholdForDexes raises the floor for a 1inch leg", () => {
    const base = 0.2;
    const inchMin = 0.5;
    assert.equal(spreadThresholdForDexes("UNISWAP", "SUSHISWAP", base, inchMin), base);
    assert.equal(spreadThresholdForDexes("1INCH", "UNISWAP", base, inchMin), inchMin);
    assert.equal(spreadThresholdForDexes("UNISWAP", "1INCH", base, inchMin), inchMin);
    // base already above the 1inch floor → keep the higher base
    assert.equal(spreadThresholdForDexes("1INCH", "UNISWAP", 0.8, inchMin), 0.8);
});

test("estimateGasLimit: base + per-step, 1inch legs cost extra", () => {
    // 2 standard swaps
    assert.equal(estimateGasLimit(2, 0), 200_000n + 150_000n * 2n);
    // 2 swaps, one of them 1inch
    assert.equal(estimateGasLimit(2, 1), 200_000n + 150_000n * 2n + 100_000n);
    // unknown route → assume a 2-swap round trip
    assert.equal(estimateGasLimit(0, 0), 200_000n + 150_000n * 2n);
    // monotonic in swap count
    assert.ok(estimateGasLimit(3, 0) > estimateGasLimit(2, 0));
});

test("routeCooldownKey: tokenB disambiguates same-A pairs; case-insensitive", () => {
    const k1 = routeCooldownKey(WETH, USDC, "UNISWAP", "SUSHISWAP");
    const k2 = routeCooldownKey(WETH, AERO, "UNISWAP", "SUSHISWAP");
    assert.notEqual(k1, k2); // same tokenA + same DEXes, different tokenB → distinct
    assert.equal(
        routeCooldownKey(WETH.toUpperCase().replace("0X", "0x"), USDC, "UNISWAP", "SUSHISWAP"),
        k1
    );
});

test("isInCooldown: window semantics", () => {
    const now = 1_000_000;
    assert.equal(isInCooldown(undefined, now, 60_000), false); // never failed
    assert.equal(isInCooldown(now - 30_000, now, 60_000), true); // 30s ago, within 60s
    assert.equal(isInCooldown(now - 60_000, now, 60_000), false); // exactly at boundary → expired
    assert.equal(isInCooldown(now - 90_000, now, 60_000), false); // long past
});

test("parseWatchPairsCsv: valid csv parses; whitespace tolerated", () => {
    const pairs = parseWatchPairsCsv(` ${WETH} , ${USDC} ; ${WETH},${AERO} `);
    assert.equal(pairs.length, 2);
    assert.equal(pairs[0].tokenA, WETH);
    assert.equal(pairs[0].tokenB, USDC);
    assert.equal(pairs[1].tokenB, AERO);
});

test("parseWatchPairsCsv: throws on malformed address (fail fast)", () => {
    assert.throws(() => parseWatchPairsCsv(`${WETH},0x1234`));
    assert.throws(() => parseWatchPairsCsv(`notanaddress,${USDC}`));
});

test("parseWatchPairsCsv: empty/blank segments ignored", () => {
    assert.deepEqual(parseWatchPairsCsv(""), []);
    assert.deepEqual(parseWatchPairsCsv(" ; ; "), []);
});
