/**
 * Pure, side-effect-free strategy math for the arbitrage watcher.
 *
 * These functions are extracted from scripts/mainnet/watchAndExecute.ts so the
 * decision logic (thresholds, outlier filtering, gas estimation, cooldown
 * keying) can be unit-tested without a provider, RPC URL, or env file. The
 * watcher imports them back and supplies its configured constants as arguments.
 *
 * Nothing in this module reads process.env or touches the network.
 */

/** A quote carrying the only field the outlier filter needs. */
export interface QuoteLike {
    amountOut: bigint;
}

/**
 * M3: IQR-based outlier filter — more robust than a single median × factor.
 * Drops quotes whose amountOut falls outside [Q1 - 2·IQR, Q3 + 2·IQR].
 * Returns the input unchanged when there are fewer than 3 quotes (not enough
 * data to compute quartiles) or the quartiles are degenerate.
 */
export function filterQuoteOutliers<T extends { q: QuoteLike }>(
    quotes: T[],
    onDrop?: (removed: number, iqr: bigint, lower: bigint, upper: bigint) => void
): T[] {
    if (quotes.length < 3) return quotes;
    const values = quotes.map(x => x.q.amountOut).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    if (!q1 || !q3 || q1 <= 0n) return quotes;
    const iqr = q3 - q1;
    const lowerBound = q1 - iqr * 2n;
    const upperBound = q3 + iqr * 2n;
    const kept = quotes.filter(x => {
        const out = x.q.amountOut;
        return out >= (lowerBound > 0n ? lowerBound : 0n) && out <= upperBound;
    });
    if (onDrop && kept.length !== quotes.length) {
        onDrop(quotes.length - kept.length, iqr, lowerBound, upperBound);
    }
    return kept;
}

/**
 * Spread threshold for a route. Routes with a 1inch leg require a wider
 * minimum spread because 1inch aggregates across venues (its quote already
 * prices in the on-chain DEX legs, so a thin 1inch-vs-DEX spread is often not
 * executable on-chain).
 */
export function spreadThresholdForDexes(
    forwardDex: string,
    reverseDex: string,
    baseThresholdPct: number,
    inchLegMinSpreadPct: number
): number {
    const hasInchLeg = forwardDex === "1INCH" || reverseDex === "1INCH";
    return hasInchLeg ? Math.max(baseThresholdPct, inchLegMinSpreadPct) : baseThresholdPct;
}

/**
 * M4: Static gas-limit estimate from route complexity. The executor re-estimates
 * on-chain and pads by 20%, so this static value is only used to price gas cost
 * before deciding whether the trade clears the profit floor.
 */
export function estimateGasLimit(
    swapCount: number,
    inchLegCount: number
): bigint {
    const baseGas = 200_000n; // flash loan callback + overhead
    const perStepGas = 150_000n; // standard DEX swap
    const inchExtraGas = 100_000n; // 1inch aggregator is heavier (per 1inch leg)
    // No route info: assume a 2-swap round trip.
    const steps = swapCount <= 0 ? 2 : swapCount;
    return baseGas + perStepGas * BigInt(steps) + inchExtraGas * BigInt(Math.max(0, inchLegCount));
}

/**
 * Cooldown key for a route: token pair + DEX combo, lowercased. tokenB is part
 * of the key so in all/list mode pairs sharing tokenA and the same DEX combo
 * (e.g. WETH/USDC vs WETH/AERO) do not block each other.
 */
export function routeCooldownKey(
    tokenA: string,
    tokenB: string,
    forwardDex: string,
    reverseDex: string
): string {
    return `${tokenA.toLowerCase()}|${tokenB.toLowerCase()}|${forwardDex}|${reverseDex}`;
}

/** True when a failed-at timestamp is still within the cooldown window. */
export function isInCooldown(
    failedAt: number | undefined,
    nowMs: number,
    cooldownMs: number
): boolean {
    return failedAt !== undefined && nowMs - failedAt < cooldownMs;
}

const WATCH_PAIR_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Validate a WATCH_PAIRS csv into { tokenA, tokenB } pairs. Throws on malformed
 * addresses (fail fast — a typo would otherwise silently drop every quote for
 * that pair). Checksum normalization is the caller's job (it needs getAddress).
 */
export function parseWatchPairsCsv(csv: string): { tokenA: string; tokenB: string }[] {
    const pairs = csv
        .split(";")
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            const [a, b] = part.split(",").map(s => s.trim());
            return { tokenA: a, tokenB: b };
        })
        .filter(p => p.tokenA && p.tokenB);
    const invalid = pairs.filter(
        p => !WATCH_PAIR_ADDRESS_RE.test(p.tokenA) || !WATCH_PAIR_ADDRESS_RE.test(p.tokenB)
    );
    if (invalid.length > 0) {
        throw new Error(
            `Invalid token address in WATCH_PAIRS: ${invalid.map(p => `${p.tokenA},${p.tokenB}`).join(" | ")} (expected 0x-prefixed 40-hex addresses, format 0xAAA,0xBBB;0xCCC,0xDDD)`
        );
    }
    return pairs;
}
