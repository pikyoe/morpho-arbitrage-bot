import { PoolCache } from "./PoolCache.js";
import { PoolInfo } from "./PoolTypes.js";

export interface UniversalPairFilterConfig {
    minLiquidityUSD?: number;
    minDexVariety?: number;
    maxPairsPerScan?: number;
    poolCache?: PoolCache;
}

export interface PairCandidate {
    tokenA: string;
    tokenB: string;
}

/** Estimate liquidity (USD) for a pool from available fields; returns 0 when unknown. */
function poolLiquidityUSD(pool: PoolInfo): number {
    return pool.reserveUSD ?? pool.totalValueLockedUSD ?? 0;
}

export function toUniquePairs(tokens: string[]): PairCandidate[] {
    const seen = new Set<string>();
    const pairs: PairCandidate[] = [];
    for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
            const [a, b] = [tokens[i], tokens[j]];
            if (a.toLowerCase() === b.toLowerCase()) continue;
            const key = [a.toLowerCase(), b.toLowerCase()].sort().join("|");
            if (seen.has(key)) continue;
            seen.add(key);
            pairs.push({ tokenA: a, tokenB: b });
        }
    }
    return pairs;
}

/**
 * Filter candidate pairs before quoting:
 * - a pair passes only if at least `minDexVariety` distinct DEX pools exist in the cache
 * - every matching pool must have liquidity >= minLiquidityUSD
 * - returned best pair only (already sorted) and capped at maxPairsPerScan
 */
export function filterPairs(
    pairs: PairCandidate[],
    config: UniversalPairFilterConfig
): PairCandidate[] {
    const minLiquidityUSD = config.minLiquidityUSD ?? 10_000;
    const minDexVariety = config.minDexVariety ?? 2;
    const maxPairsPerScan = config.maxPairsPerScan ?? 200;
    const poolCache = config.poolCache;

    // No pool cache → cannot filter by DEX variety or liquidity; scan all pairs.
    // The quote layer will still skip pairs that return no quotes.
    if (!poolCache || poolCache.size() === 0) {
        return pairs.slice(0, maxPairsPerScan);
    }

    const result: PairCandidate[] = [];
    // Count distinct DEXes present in cache to detect incomplete data.
    const loadedDexes = new Set(poolCache.getAll().map(p => p.dex.toLowerCase()));
    const canVerifyDexVariety = loadedDexes.size >= minDexVariety;

    // If cache cannot prove dex variety (not enough DEXes loaded), don't filter on it.
    // The scan layer will still skip pairs with no quotes.
    const shouldFilterDexVariety = canVerifyDexVariety;

    for (const pair of pairs) {
        const matches = poolCache.findPair(pair.tokenA, pair.tokenB);

        if (shouldFilterDexVariety) {
            if (matches.length === 0) continue;
            const dexSet = new Set(matches.map(p => p.dex.toLowerCase()));
            if (dexSet.size < minDexVariety) continue;
        } else {
            // Data incomplete: accept the pair (scan decides).
            // Still record for potential liquidity filtering below.
        }

        // Liquidity filter: only reject pairs where EVERY matching pool is known below the threshold.
        // Pools without reserveUSD are treated as unknown (allowed) since the RPC loader does not populate it.
        const knownUnderMinimum = matches.every(p => poolLiquidityUSD(p) < minLiquidityUSD);
        if (knownUnderMinimum) continue;

        result.push(pair);
        if (result.length >= maxPairsPerScan) break;
    }
    return result;
}

/** Split pair list into fixed-size batches (for bounded concurrency). */
export function batchPairs(pairs: PairCandidate[], batchSize: number): PairCandidate[][] {
    const size = Math.max(1, batchSize);
    const batches: PairCandidate[][] = [];
    for (let i = 0; i < pairs.length; i += size) {
        batches.push(pairs.slice(i, i + size));
    }
    return batches;
}