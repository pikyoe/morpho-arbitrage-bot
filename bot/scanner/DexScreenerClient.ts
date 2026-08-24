/**
 * DexScreener API client for token/pair discovery on Base.
 *
 * Free public API, no key required. Endpoints used:
 * - GET /token-boosts/top/v1        — trending (most-boosted) tokens
 * - GET /token-profiles/latest/v1   — newest profiled tokens
 * - GET /latest/dex/tokens/{addr}   — full pair list for one token
 *
 * Docs: https://docs.dexscreener.com/api/reference
 */

const DEXSCREENER_BASE = "https://api.dexscreener.com";

export interface DexScreenerPair {
    chainId: string;
    dexId: string;
    pairAddress: string;
    baseToken: { address: string; name: string; symbol: string };
    quoteToken: { address: string; name: string; symbol: string };
    priceNative?: string;
    priceUsd?: string;
    txns?: { h24?: { buys: number; sells: number } };
    volume?: { h24?: number };
    liquidity?: { usd?: number };
    priceChange?: { h24?: number };
}

export interface TrendingToken {
    address: string;
    symbol: string;
    name: string;
    source: "boosts" | "profiles";
    liquidityUsd: number;
    volume24hUsd: number;
    priceUsd: number | null;
    txns24h: number;
    pairCount: number;
}

interface BoostEntry {
    chainId?: string;
    tokenAddress?: string;
    symbol?: string;
    name?: string;
}

const WETH = "0x4200000000000000000000000000000000000006".toLowerCase();
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
// Never surface the quote currencies themselves as "discovered" tokens.
const EXCLUDED = new Set([WETH, USDC]);

function timeoutSignal(ms: number): AbortSignal {
    return AbortSignal.timeout(ms);
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T | null> {
    try {
        const res = await fetch(url, { signal: timeoutSignal(timeoutMs) });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        return null;
    }
}

/**
 * Fetch trending tokens on Base. The boosts/profiles feeds are unreliable for
 * Base (often empty or sparse), so a broad DexScreener pair search is used as
 * a fallback source of liquid Base tokens.
 */
export async function getTrendingBaseTokens(limit = 30): Promise<TrendingToken[]> {
    const [boosts, profiles, search] = await Promise.all([
        fetchJson<BoostEntry[]>(`${DEXSCREENER_BASE}/token-boosts/top/v1`),
        fetchJson<BoostEntry[]>(`${DEXSCREENER_BASE}/token-profiles/latest/v1`),
        fetchJson<{ pairs?: DexScreenerPair[] }>(`${DEXSCREENER_BASE}/latest/dex/search?q=base`),
    ]);

    const seen = new Set<string>();
    const addresses: { address: string; source: TrendingToken["source"] }[] = [];
    const push = (address: string | undefined, source: TrendingToken["source"]) => {
        if (!address) return;
        const key = address.toLowerCase();
        if (seen.has(key) || EXCLUDED.has(key)) return;
        seen.add(key);
        addresses.push({ address, source });
    };

    for (const entry of boosts ?? []) {
        if (entry.chainId === "base") push(entry.tokenAddress, "boosts");
    }
    for (const entry of profiles ?? []) {
        if (entry.chainId === "base") push(entry.tokenAddress, "profiles");
    }
    // Fallback/supplement: base tokens from liquid search pairs.
    for (const pair of search?.pairs ?? []) {
        if (pair.chainId !== "base") continue;
        const base = pair.baseToken?.address;
        const quote = pair.quoteToken?.address;
        // Pick the non-quote side of the pair as the discovered token.
        if (base && !EXCLUDED.has(base.toLowerCase())) push(base, "profiles");
        else if (quote) push(quote, "profiles");
    }

    // Cap candidates before hydration: the free DexScreener API rate-limits,
    // so firing one getTokenPairs per address for dozens of candidates triggers
    // transient 429s that silently drop tokens. A small multiple of `limit`
    // keeps enough headroom after the empties are filtered out.
    const candidates = addresses.slice(0, Math.max(limit * 2, 10));

    // Hydrate each candidate with its pair stats (liquidity/volume).
    const tokens = await Promise.all(
        candidates.map(async ({ address, source }) => {
            const pairs = await getTokenPairs(address);
            const basePairs = pairs.filter(p => p.chainId === "base");
            if (basePairs.length === 0) return null;

            // Sort by liquidity so the representative price comes from the
            // dominant pool, not an arbitrary (possibly thin) first pair.
            basePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
            const liquidityUsd = basePairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
            const volume24hUsd = basePairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
            const txns24h = basePairs.reduce(
                (s, p) => s + (p.txns?.h24?.buys ?? 0) + (p.txns?.h24?.sells ?? 0), 0);
            const meta = basePairs.find(p => p.baseToken.address.toLowerCase() === address.toLowerCase())
                ?.baseToken
                ?? basePairs[0].baseToken
                ?? basePairs[0].quoteToken;
            const priceUsd = basePairs[0]?.priceUsd ? Number(basePairs[0].priceUsd) : null;

            const token: TrendingToken = {
                address,
                symbol: meta.symbol ?? "???",
                name: meta.name ?? "",
                source,
                liquidityUsd,
                volume24hUsd,
                priceUsd,
                txns24h,
                pairCount: basePairs.length,
            };
            return token;
        })
    );

    return tokens
        .filter((t): t is TrendingToken => t !== null)
        .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
        .slice(0, limit);
}

/** Fetch all DEX pairs for a token address. */
export async function getTokenPairs(tokenAddress: string): Promise<DexScreenerPair[]> {
    const data = await fetchJson<{ pairs?: DexScreenerPair[] }>(
        `${DEXSCREENER_BASE}/latest/dex/tokens/${tokenAddress}`);
    return data?.pairs ?? [];
}
