import { PoolCache } from "./PoolCache.js";
import { PoolInfo } from "./PoolTypes.js";
import { getActiveUniverse } from "./TokenUniverse.js";

export interface TokenGraph {
    tokens: Set<string>;
    edges: Map<string, Set<string>>; // token -> Set of connected tokens
    dexEdges: Map<string, Map<string, Set<string>>>; // dex -> token -> Set of connected tokens
}

// Token whitelist for Base mainnet - loaded from environment variable
// Format: comma-separated token addresses
// Example: TOKEN_WHITELIST=0x8335...,0x4200...,0x50c5...
// If not set, will use active universe tokens
const TOKEN_WHITELIST: string[] = process.env.TOKEN_WHITELIST 
  ? process.env.TOKEN_WHITELIST.split(',').map(addr => addr.trim().toLowerCase())
  : getActiveUniverse().tokens.map(addr => addr.toLowerCase());

// Anchor tokens for triangle generation
const ANCHOR_TOKENS = [
    "0x833589fCD6eDb6E08f4c7C32D4f71b54bDA02913", // USDC
    "0x4200000000000000000000000000000000000006", // WETH
].map(addr => addr.toLowerCase());

const DEFAULT_POOL_LIMIT = 50;

// Set SUBGRAPH_VERBOSE=true to log every raw pool row during subgraph loading.
// Off by default: per-pool rows are extremely noisy (one line per pool) and the
// subgraph URL line would also print the Graph API key into the watcher logs.
const SUBGRAPH_VERBOSE = process.env.SUBGRAPH_VERBOSE === "true";
const TRIANGLE_POOL_LIMIT = 500; // Higher limit for triangle discovery
const MIN_VOLUME_USD = 1000; // $1K minimum for triangle discovery
const MAX_VOLUME_USD = 1000000000; // Very high
const MIN_LIQUIDITY_USD = 5000; // $5K minimum for triangle discovery
const MAX_LIQUIDITY_USD = 1000000000; // Very high
const MIN_AGE_SECONDS = 86400; // 1 day minimum

// Bridge token addresses for targeted pool loading
const BRIDGE_TOKENS = [
    "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", // USDe
    "0x8d58C0C60B8D6b88Fa98B291a646dB34d0F98258", // RLUSD
    "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842"  // MORPHO_TOKEN
];

const UNISWAP_TOP_POOLS_QUERY = `
query topPools(
  $first: Int!,
  $minTvl: BigDecimal!,
  $maxTvl: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pools(
    first: $first,
    orderBy: volumeUSD,
    orderDirection: desc,
    where: {
      totalValueLockedUSD_gte: $minTvl,
      totalValueLockedUSD_lte: $maxTvl,
      volumeUSD_gte: $minVolumeUsd,
      volumeUSD_lte: $maxVolumeUsd
    }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    totalValueLockedUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

// Query for specific token pairs (USDC/WETH)
const UNISWAP_TOKEN_PAIR_QUERY = `
query tokenPair($token0: String!, $token1: String!) {
  pools(
    first: 10,
    orderBy: totalValueLockedUSD,
    orderDirection: desc,
    where: {
      or: [
        { token0: $token0, token1: $token1 },
        { token0: $token1, token1: $token0 }
      ]
    }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    totalValueLockedUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

// Note: the SushiSwap subgraph schema for `pools` uses totalValueLockedUSD;
// reserveUSD only exists on the legacy `pairs` entity (see SUSHISWAP_TOP_PAIRS_QUERY).
const SUSHISWAP_TOP_POOLS_QUERY = `
query topPools(
  $first: Int!,
  $minTvl: BigDecimal!,
  $maxTvl: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pools(
    first: $first,
    orderBy: volumeUSD,
    orderDirection: desc,
    where: {
      totalValueLockedUSD_gte: $minTvl,
      totalValueLockedUSD_lte: $maxTvl,
      volumeUSD_gte: $minVolumeUsd,
      volumeUSD_lte: $maxVolumeUsd
    }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    totalValueLockedUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

const SUSHISWAP_TOP_PAIRS_QUERY = `
query topPairs(
  $first: Int!,
  $minReserveUsd: BigDecimal!,
  $maxReserveUsd: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pairs(
    first: $first,
    orderBy: reserveUSD,
    orderDirection: desc,
    where: {
      reserveUSD_gte: $minReserveUsd,
      reserveUSD_lte: $maxReserveUsd,
      volumeUSD_gte: $minVolumeUsd,
      volumeUSD_lte: $maxVolumeUsd
    }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    reserveUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

// The official PancakeSwap V3 Base subgraph
// (id 84ADrft27B8Jo46mdknbJ3PHoJ5wK5YeNBrYTD19WnaH) is a FACTORY subgraph: it
// indexes PoolCreated events and exposes no `pools`/`pairs` liquidity entity,
// so the pool/Pairs queries below are kept only for richer V3/V2 endpoints.
const PANCAKESWAP_TOP_POOLS_QUERY = `
query topPools(
  $first: Int!,
  $minTvl: BigDecimal!,
  $maxTvl: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pools(
    first: $first,
    orderBy: volumeUSD,
    orderDirection: desc,
    where: {
      totalValueLockedUSD_gte: $minTvl,
      totalValueLockedUSD_lte: $maxTvl,
      volumeUSD_gte: $minVolumeUsd,
      volumeUSD_lte: $maxVolumeUsd
    }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    totalValueLockedUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

// Fallback for PancakeSwap V2-style subgraphs, which expose `pairs` (reserveUSD)
// instead of the V3-style `pools` entity.
const PANCAKESWAP_TOP_PAIRS_QUERY = `
query topPairs(
  $first: Int!,
  $minReserveUsd: BigDecimal!,
  $maxReserveUsd: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pairs(
    first: $first,
    orderBy: reserveUSD,
    orderDirection: desc,
    where: {
      reserveUSD_gte: $minReserveUsd,
      reserveUSD_lte: $maxReserveUsd,
      volumeUSD_gte: $minVolumeUsd,
      volumeUSD_lte: $maxVolumeUsd
    }
  ) {
    id
    token0 { id }
    token1 { id }
    reserveUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

// Recent PoolCreated events from the factory subgraph. token0/token1 are
// plain Bytes here (not Token entities), and `fee` is an Int (not `feeTier`).
// No TVL/volume exists at this level — those are filtered downstream.
const PANCAKESWAP_POOL_CREATEDS_QUERY = `
query poolCreateds($first: Int!) {
  poolCreateds(
    first: $first,
    orderBy: blockNumber,
    orderDirection: desc
  ) {
    pool
    token0
    token1
    fee
    blockNumber
    blockTimestamp
  }
}
`;

// Exact pool lookup for one token pair against the factory subgraph (both
// orderings). Guarantees a watched pair is found even when it is older than
// the recent-events window used by the broad loadPancakeSwap fallback.
const PANCAKESWAP_POOL_CREATEDS_PAIR_QUERY = `
query poolCreatedsForPair($t0: String!, $t1: String!) {
  poolCreateds(
    first: 50,
    where: {
      or: [
        { token0: $t0, token1: $t1 },
        { token0: $t1, token1: $t0 }
      ]
    }
  ) {
    pool
    token0
    token1
    fee
    blockTimestamp
  }
}
`;

// BigDecimal orderBy (volumeUSD/totalValueLockedUSD) consistently times out
// on gateway indexers for this subgraph ("bad indexers: Timeout"), so we
// paginate by id (indexed, fast) and filter/sort client-side instead.
const AERODROME_POOLS_PAGE_QUERY = `
query poolsPage(
  $first: Int!,
  $afterId: String!,
  $beforeId: String!
) {
  pools(
    first: $first,
    orderBy: id,
    orderDirection: asc,
    where: { id_gt: $afterId, id_lt: $beforeId }
  ) {
    id
    token0 { id }
    token1 { id }
    feeTier
    totalValueLockedUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;
const AERODROME_PAGE_SIZE = 500;
// Shard by id prefix so each query stays small enough for the gateway
// indexers (unbounded scans with 1000+ rows time out on this subgraph).
const AERODROME_SHARD_BOUNDS: Array<[string, string]> = [
    ["0x0", "0x2"], ["0x2", "0x4"], ["0x4", "0x6"], ["0x6", "0x8"],
    ["0x8", "0xa"], ["0xa", "0xc"], ["0xc", "0xe"], ["0xe", "0xg"]
];

export class SubgraphPoolLoader {
    private readonly whitelistSet: Set<string>;

    constructor(
        private readonly cache: PoolCache
    ) {
        // Create lowercase whitelist Set once for efficient case-insensitive lookups
        this.whitelistSet = new Set(
            TOKEN_WHITELIST.map(address => address.toLowerCase())
        );
    }

    public async loadUniswap(
        subgraphUrl: string,
        topPools: number = DEFAULT_POOL_LIMIT
    ): Promise<void> {
        const result = await this.querySubgraph(
            subgraphUrl,
            UNISWAP_TOP_POOLS_QUERY,
            {
                first: topPools,
                minTvl: MIN_LIQUIDITY_USD,
                maxTvl: MAX_LIQUIDITY_USD,
                minVolumeUsd: MIN_VOLUME_USD,
                maxVolumeUsd: MAX_VOLUME_USD
            }
        );

        const pools = result?.data?.pools;
        if (!Array.isArray(pools)) {
            return;
        }

        for (const pool of pools) {
            const token0 = pool?.token0?.id;
            const token1 = pool?.token1?.id;
            const feeTier = pool?.feeTier;

            if (!token0 || !token1 || !pool?.id) {
                continue;
            }

            if (!this.isEligiblePool(pool)) {
                continue;
            }

            const fee = Number(feeTier ?? 3000);
            if (Number.isNaN(fee) || fee <= 0) {
                continue;
            }

            this.cache.add({
                dex: "UNISWAP",
                pool: pool.id,
                token0,
                token1,
                fee,
                reserveUSD: Number(pool.totalValueLockedUSD ?? 0),
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0),
                factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" // Uniswap V3 factory on Base
            });
        }

    }

    public async loadSushiSwap(
        subgraphUrl: string,
        topPools: number = DEFAULT_POOL_LIMIT
    ): Promise<void> {
        if (SUBGRAPH_VERBOSE) {
            console.log(`[SushiSwap] Loading pools from ${subgraphUrl}`);
        }
        
        let response = await this.querySubgraph(
            subgraphUrl,
            SUSHISWAP_TOP_POOLS_QUERY,
            {
                first: topPools,
                minTvl: MIN_LIQUIDITY_USD,
                maxTvl: MAX_LIQUIDITY_USD,
                minVolumeUsd: MIN_VOLUME_USD,
                maxVolumeUsd: MAX_VOLUME_USD
            }
        );

        let pools = response?.data?.pools;
        console.log(`[SushiSwap] Primary query returned ${pools?.length || 0} pools`);

        if (!Array.isArray(pools) || pools.length === 0) {
            console.log(`[SushiSwap] Trying pairs query...`);
            response = await this.querySubgraph(
                subgraphUrl,
                SUSHISWAP_TOP_PAIRS_QUERY,
                {
                    first: topPools,
                    minReserveUsd: MIN_LIQUIDITY_USD,
                    maxReserveUsd: MAX_LIQUIDITY_USD,
                    minVolumeUsd: MIN_VOLUME_USD,
                    maxVolumeUsd: MAX_VOLUME_USD
                }
            );
            pools = response?.data?.pairs;
            console.log(`[SushiSwap] Pairs query returned ${pools?.length || 0} pools`);
        }

        if (!Array.isArray(pools)) {
            return;
        }

        for (const pool of pools) {
            const token0 = pool?.token0?.id;
            const token1 = pool?.token1?.id;
            const feeTier = pool?.feeTier ?? (pool?.stable !== undefined ? (pool.stable ? 100 : 3000) : 3000);
            const stable = pool?.stable ?? false;
            const reserveUSD = Number(pool.reserveUSD ?? pool.totalValueLockedUSD ?? 0);

            if (!token0 || !token1 || !pool?.id) {
                continue;
            }

            if (!this.isEligiblePool({
                ...pool,
                reserveUSD,
                totalValueLockedUSD: pool.totalValueLockedUSD
            })) {
                continue;
            }

            this.cache.add({
                dex: "SUSHISWAP",
                pool: pool.id,
                token0,
                token1,
                fee: Number(feeTier),
                stable: Boolean(stable),
                reserveUSD,
                volumeUSD: Number(pool.volumeUSD ?? 0),
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0),
                factory: "0x71524B4f93c58fcbF659783284E38825f0622859" // SushiSwap V2 factory on Base
            });
        }
    }

    public async loadAerodrome(
        subgraphUrl: string,
        topPools: number = DEFAULT_POOL_LIMIT
    ): Promise<void> {
        if (SUBGRAPH_VERBOSE) {
            console.log(`[Aerodrome] Loading pools from ${subgraphUrl}`);
        }
        
        const shardResults = await Promise.all(
            AERODROME_SHARD_BOUNDS.map(async ([lowerId, upperId]) => {
                const shardPools: any[] = [];
                let afterId = lowerId;
                while (true) {
                    const response = await this.querySubgraph(
                        subgraphUrl,
                        AERODROME_POOLS_PAGE_QUERY,
                        { first: AERODROME_PAGE_SIZE, afterId, beforeId: upperId }
                    );
                    const pools = response?.data?.pools;
                    if (!Array.isArray(pools) || pools.length === 0) {
                        break;
                    }
                    shardPools.push(...pools);
                    afterId = pools[pools.length - 1].id;
                    if (pools.length < AERODROME_PAGE_SIZE) {
                        break;
                    }
                }
                return shardPools;
            })
        );

        const eligible: any[] = [];
        for (const pool of shardResults.flat()) {
            if (this.isEligiblePool(pool)) {
                eligible.push(pool);
            }
        }

        eligible.sort((a, b) => Number(b?.volumeUSD ?? 0) - Number(a?.volumeUSD ?? 0));
        const topEligible = eligible.slice(0, topPools);
        console.log(`[Aerodrome] ${eligible.length} eligible pools after scan, keeping top ${topEligible.length}`);

        for (const pool of topEligible) {
            const token0 = pool?.token0?.id;
            const token1 = pool?.token1?.id;
            const feeTier = pool?.feeTier;

            if (!token0 || !token1 || !pool?.id) {
                continue;
            }

            const fee = Number(feeTier ?? 3000);
            if (Number.isNaN(fee) || fee <= 0) {
                continue;
            }

            this.cache.add({
                dex: "AERODROME",
                pool: pool.id,
                token0,
                token1,
                fee,
                reserveUSD: Number(pool.totalValueLockedUSD ?? 0),
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0),
                factory: "0x420DD381b31aEf6683db6B902084cB0FFECe40Da" // Aerodrome factory on Base
            });
        }
    }

    /**
     * Load pools specifically for triangle discovery
     * Uses higher pool limit and broader liquidity filters
     */
    public async loadForTriangleDiscovery(
        uniswapSubgraphUrl: string,
        sushiSwapSubgraphUrl: string,
        pancakeswapSubgraphUrl?: string,
        aerodromeSubgraphUrl?: string
    ): Promise<void> {
        console.log("Loading pools for triangle discovery...");
        
        // Load more pools for triangle discovery
        console.log(`Loading Uniswap pools from ${this.redactUrl(uniswapSubgraphUrl)}`);
        await this.loadUniswap(uniswapSubgraphUrl, TRIANGLE_POOL_LIMIT);

        console.log(`Loading SushiSwap pools from ${this.redactUrl(sushiSwapSubgraphUrl)}`);
        await this.loadSushiSwap(sushiSwapSubgraphUrl, TRIANGLE_POOL_LIMIT);

        // Load PancakeSwap if URL provided
        if (pancakeswapSubgraphUrl) {
            console.log(`Loading PancakeSwap pools from ${this.redactUrl(pancakeswapSubgraphUrl)}`);
            await this.loadPancakeSwap(pancakeswapSubgraphUrl, TRIANGLE_POOL_LIMIT);
        }

        // Load Aerodrome if URL provided
        if (aerodromeSubgraphUrl) {
            console.log(`Loading Aerodrome pools from ${this.redactUrl(aerodromeSubgraphUrl)}`);
            await this.loadAerodrome(aerodromeSubgraphUrl, TRIANGLE_POOL_LIMIT);
        }
        
        // Load specific USDC/WETH pools
        const usdcLower = ANCHOR_TOKENS[0];
        const wethLower = ANCHOR_TOKENS[1];
        await this.loadUniswapTokenPair(uniswapSubgraphUrl, usdcLower, wethLower);
        await this.loadSushiSwapTokenPair(sushiSwapSubgraphUrl, usdcLower, wethLower);
        
        const allPools = this.cache.getAll();
        console.log(`Loaded ${allPools.length} pools from subgraph`);
        
        // Debug: Check pool distribution by DEX
        const dexPoolCounts: Record<string, number> = {};
        for (const pool of allPools) {
            dexPoolCounts[pool.dex] = (dexPoolCounts[pool.dex] || 0) + 1;
        }
        console.log("Pool distribution by DEX:", dexPoolCounts);
        
        // Debug: Print Aerodrome pools containing USDC (disabled for cleaner logs)
        // console.log("\n=== Aerodrome USDC Pools ===");
        const sushiSwapUsdcPools = [];
        for (const pool of allPools) {
            if (pool.dex !== "SUSHISWAP") continue;

            const t0 = pool.token0.toLowerCase();
            const t1 = pool.token1.toLowerCase();

            if (
                t0 === ANCHOR_TOKENS[0] ||
                t1 === ANCHOR_TOKENS[0]
            ) {
                sushiSwapUsdcPools.push(pool);
                // Disabled detailed pool logging
                // console.log(
                //     "AERO USDC:",
                //     pool.pool,
                //     t0,
                //     t1,
                //     "stable:",
                //     pool.stable,
                //     "reserve:",
                //     pool.reserveUSD
                // );
            }
        }
        console.log(`Total SushiSwap USDC pools: ${sushiSwapUsdcPools.length}`);
        
        // Debug: Check for duplicates
        const poolIds = new Set(sushiSwapUsdcPools.map(p => p.pool));
        if (poolIds.size !== sushiSwapUsdcPools.length) {
            console.log(`⚠️ DUPLICATE POOLS DETECTED: ${sushiSwapUsdcPools.length - poolIds.size} duplicates`);
        }
        
        // Debug: Print Aerodrome pools containing WETH (disabled for cleaner logs)
        // console.log("\n=== Aerodrome WETH Pools ===");
        const sushiSwapWethPools = [];
        for (const pool of allPools) {
            if (pool.dex !== "SUSHISWAP") continue;

            const t0 = pool.token0.toLowerCase();
            const t1 = pool.token1.toLowerCase();

            if (
                t0 === ANCHOR_TOKENS[1] ||
                t1 === ANCHOR_TOKENS[1]
            ) {
                sushiSwapWethPools.push(pool);
                // Disabled detailed pool logging
                // console.log(
                //     "AERO WETH:",
                //     pool.pool,
                //     t0,
                //     t1,
                //     "stable:",
                //     pool.stable,
                //     "reserve:",
                //     pool.reserveUSD
                // );
            }
        }
        console.log(`Total SushiSwap WETH pools: ${sushiSwapWethPools.length}`);
        
        // Debug: Check for duplicates
        const wethPoolIds = new Set(sushiSwapWethPools.map(p => p.pool));
        if (wethPoolIds.size !== sushiSwapWethPools.length) {
            console.log(`⚠️ DUPLICATE POOLS DETECTED: ${sushiSwapWethPools.length - wethPoolIds.size} duplicates`);
        }
        
        // Debug summary
        this.printPoolSummary(allPools);
        
        // Build token graph
        const tokenGraph = this.buildTokenGraph();
        
        // Generate triangles using anchor tokens
        const triangles = this.generateAnchorTriangles(tokenGraph);
        console.log(`Generated ${triangles.length} triangles using anchor pattern`);
    }

    /**
     * Load specific token pair from Uniswap subgraph
     */
    public async loadUniswapTokenPair(
        subgraphUrl: string,
        token0: string,
        token1: string
    ): Promise<void> {
        const result = await this.querySubgraph(
            subgraphUrl,
            UNISWAP_TOKEN_PAIR_QUERY,
            { token0, token1 }
        );

        const pools = result?.data?.pools;
        if (!Array.isArray(pools)) {
            return;
        }

        console.log(`Loading ${pools.length} Uniswap pools for ${token0.slice(0,6)}/${token1.slice(0,6)}`);

        for (const pool of pools) {
            const poolToken0 = pool?.token0?.id;
            const poolToken1 = pool?.token1?.id;
            const feeTier = pool?.feeTier;

            if (!poolToken0 || !poolToken1 || !pool?.id) {
                continue;
            }

            const fee = Number(feeTier ?? 3000);
            if (Number.isNaN(fee) || fee <= 0) {
                continue;
            }

            this.cache.add({
                dex: "UNISWAP",
                pool: pool.id,
                token0: poolToken0,
                token1: poolToken1,
                fee,
                reserveUSD: Number(pool.totalValueLockedUSD ?? 0),
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0),
                factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" // Uniswap V3 factory on Base
            });
        }
    }

    /**
     * Load specific token pair from Aerodrome subgraph
     */
    public async loadSushiSwapTokenPair(
        subgraphUrl: string,
        token0: string,
        token1: string
    ): Promise<void> {
        const sushiSwapTokenPairQuery = `
        query tokenPair($token0: String!, $token1: String!) {
          pools(
            first: 10,
            orderBy: reserveUSD,
            orderDirection: desc,
            where: {
              or: [
                { token0: $token0, token1: $token1 },
                { token0: $token1, token1: $token0 }
              ]
            }
          ) {
            id
            token0 { id }
            token1 { id }
            feeTier
            stable
            reserveUSD
            volumeUSD
            createdAtTimestamp
          }
        }
        `;

        const result = await this.querySubgraph(
            subgraphUrl,
            sushiSwapTokenPairQuery,
            { token0, token1 }
        );

        console.log(`SushiSwap query result for ${token0.slice(0,6)}/${token1.slice(0,6)}:`, result ? "Success" : "Failed");

        const pools = result?.data?.pools;
        if (!Array.isArray(pools)) {
            console.log(`No pools returned from SushiSwap subgraph`);
            return;
        }

        console.log(`Loading ${pools.length} SushiSwap pools for ${token0.slice(0,6)}/${token1.slice(0,6)}`);

        for (const pool of pools) {
            const poolToken0 = pool?.token0?.id;
            const poolToken1 = pool?.token1?.id;
            const feeTier = pool?.feeTier ?? (pool?.stable !== undefined ? (pool.stable ? 100 : 3000) : 3000);
            const stable = pool?.stable ?? false;
            const reserveUSD = Number(pool.reserveUSD ?? 0);

            if (!poolToken0 || !poolToken1 || !pool?.id) {
                continue;
            }

            this.cache.add({
                dex: "SUSHISWAP",
                pool: pool.id,
                token0: poolToken0,
                token1: poolToken1,
                fee: Number(feeTier),
                stable: Boolean(stable),
                reserveUSD,
                volumeUSD: Number(pool.volumeUSD ?? 0),
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0),
                factory: "0x71524B4f93c58fcbF659783284E38825f0622859" // SushiSwap V2 factory on Base
            });
        }
    }

    /**
     * Print debug summary of loaded pools
     */
    private printPoolSummary(pools: PoolInfo[]): void {
        const usdcLower = ANCHOR_TOKENS[0];
        const wethLower = ANCHOR_TOKENS[1];
        
        let usdcPools = 0;
        let wethPools = 0;
        const tokens = new Set<string>();
        const dexCount = new Map<string, number>();
        
        for (const pool of pools) {
            const t0 = pool.token0.toLowerCase();
            const t1 = pool.token1.toLowerCase();
            
            tokens.add(t0);
            tokens.add(t1);
            
            if (t0 === usdcLower || t1 === usdcLower) {
                usdcPools++;
            }
            
            if (t0 === wethLower || t1 === wethLower) {
                wethPools++;
            }
            
            dexCount.set(pool.dex, (dexCount.get(pool.dex) || 0) + 1);
        }
        
        console.log("\n=== Pool Summary ===");
        console.log(`Total pools: ${pools.length}`);
        console.log(`USDC pools: ${usdcPools}`);
        console.log(`WETH pools: ${wethPools}`);
        console.log(`Unique tokens: ${tokens.size}`);
        console.log("By DEX:");
        for (const [dex, count] of dexCount) {
            console.log(`  ${dex}: ${count} pools`);
        }
        console.log("==================\n");
    }

    /**
     * Count total edges in the graph
     */
    private countEdges(edges: Map<string, Set<string>>): number {
        let count = 0;
        for (const connections of edges.values()) {
            count += connections.size;
        }
        return count / 2; // Divide by 2 since edges are bidirectional
    }

    /**
     * Generate unique identifier for triangle based on topology and pool addresses
     * Ensures triangles with same pools but different order are not counted as duplicates
     */
    private getTriangleIdentifier(tokens: string[], poolCache: PoolCache): string {
        const [tokenA, tokenB, tokenC] = tokens;
        
        // Find best pools for each leg
        const poolAB = this.findBestPool(tokenA, tokenB, poolCache);
        const poolBC = this.findBestPool(tokenB, tokenC, poolCache);
        const poolCA = this.findBestPool(tokenC, tokenA, poolCache);
        
        // Sort tokens to ensure consistent ordering
        const sortedTokens = [tokenA, tokenB, tokenC].sort();
        
        // Create identifier from sorted tokens + pool addresses
        return `${sortedTokens.join('-')}-${poolAB?.pool || 'null'}-${poolBC?.pool || 'null'}-${poolCA?.pool || 'null'}`;
    }
    
    /**
     * Find best pool for a token pair based on liquidity
     */
    private findBestPool(tokenA: string, tokenB: string, poolCache: PoolCache): PoolInfo | null {
        const pools = poolCache.getAll().filter(p => 
            (p.token0.toLowerCase() === tokenA.toLowerCase() && p.token1.toLowerCase() === tokenB.toLowerCase()) ||
            (p.token0.toLowerCase() === tokenB.toLowerCase() && p.token1.toLowerCase() === tokenA.toLowerCase())
        );
        
        if (pools.length === 0) return null;

        // Return pool with highest USD liquidity (PoolInfo.liquidity is a raw
        // token-unit string, not USD, and is not set by subgraph loaders).
        const liquidityOf = (p: PoolInfo): number => p.reserveUSD ?? p.totalValueLockedUSD ?? 0;
        return pools.reduce((best, current) =>
            liquidityOf(current) > liquidityOf(best) ? current : best
        );
    }
    
    public async loadPancakeSwap(
        subgraphUrl: string,
        topPools: number = DEFAULT_POOL_LIMIT
    ): Promise<void> {
        if (SUBGRAPH_VERBOSE) {
            console.log(`[PancakeSwap] Loading pools from ${this.redactUrl(subgraphUrl)}`);
        }

        let result = await this.querySubgraph(
            subgraphUrl,
            PANCAKESWAP_TOP_POOLS_QUERY,
            {
                first: topPools,
                minTvl: MIN_LIQUIDITY_USD,
                maxTvl: MAX_LIQUIDITY_USD,
                minVolumeUsd: MIN_VOLUME_USD,
                maxVolumeUsd: MAX_VOLUME_USD
            }
        );

        let pools = result?.data?.pools;
        console.log(`[PancakeSwap] Raw response pools: ${pools?.length ?? 0}`);

        // The configured endpoint may be a V2-style subgraph without a `pools`
        // entity ("Type `Query` has no field `pools`"); fall back to `pairs`.
        if (!Array.isArray(pools)) {
            console.log(`[PancakeSwap] Trying pairs query...`);
            result = await this.querySubgraph(
                subgraphUrl,
                PANCAKESWAP_TOP_PAIRS_QUERY,
                {
                    first: topPools,
                    minReserveUsd: MIN_LIQUIDITY_USD,
                    maxReserveUsd: MAX_LIQUIDITY_USD,
                    minVolumeUsd: MIN_VOLUME_USD,
                    maxVolumeUsd: MAX_VOLUME_USD
                }
            );
            pools = result?.data?.pairs;
            console.log(`[PancakeSwap] Pairs query returned ${pools?.length ?? 0} pools`);
        }

        // The official PancakeSwap V3 Base subgraph is a FACTORY subgraph: it
        // has neither `pools` nor `pairs`, only PoolCreated events. Load recent
        // events so the quoter knows the real pool addresses and fee tiers;
        // liquidity/age are filtered downstream (RPC quote reverts on thin pools).
        if (!Array.isArray(pools)) {
            console.log(`[PancakeSwap] Trying factory poolCreateds query...`);
            result = await this.querySubgraph(
                subgraphUrl,
                PANCAKESWAP_POOL_CREATEDS_QUERY,
                { first: Math.max(topPools * 20, 200) }
            );
            const createds = result?.data?.poolCreateds;
            if (Array.isArray(createds)) {
                const accepted = this.cachePancakePoolCreateds(createds);
                console.log(`[PancakeSwap] Final accepted pools: ${accepted} (from factory poolCreateds)`);
                return;
            }
        }

        if (!Array.isArray(pools)) {
            console.error(
                `[PancakeSwap] Endpoint has neither \`pools\` nor \`pairs\` nor \`poolCreateds\` — ` +
                `PANCAKESWAP_SUBGRAPH_URL is misconfigured (unset it to skip this DEX, ` +
                `or load via RPC like runBot.ts does). Host: ${this.redactUrl(subgraphUrl)}`
            );
            return;
        }

        let acceptedPools = 0;

        for (const pool of pools) {
            const token0 = pool?.token0?.id;
            const token1 = pool?.token1?.id;
            const feeTier = pool?.feeTier;

            if (!token0 || !token1 || !pool?.id) {
                continue;
            }

            if (SUBGRAPH_VERBOSE) {
                console.log(
                    `[PancakeSwap] RAW POOL: ${pool.id} | ` +
                    `${pool.token0?.id} ↔ ${pool.token1?.id} | ` +
                    `TVL=${pool.totalValueLockedUSD ?? pool.reserveUSD} | ` +
                    `volume=${pool.volumeUSD} | ` +
                    `fee=${pool.feeTier}`
                );
            }

            if (!this.isEligiblePool(pool)) {
                if (SUBGRAPH_VERBOSE) {
                    console.log(
                        `[PancakeSwap] FILTERED: ${pool.id} | ` +
                        `${token0} ↔ ${token1}`
                    );
                }
                continue;
            }

            // V2 pairs carry no feeTier; PancakeSwap V2 charges 0.25% (2500).
            const fee = Number(feeTier ?? 2500);
            if (Number.isNaN(fee) || fee <= 0) {
                continue;
            }

            const liquidityUSD = Number(pool.totalValueLockedUSD ?? pool.reserveUSD ?? 0);

            this.cache.add({
                dex: "PANCAKESWAP",
                pool: pool.id,
                token0,
                token1,
                fee,
                reserveUSD: liquidityUSD,
                totalValueLockedUSD: liquidityUSD,
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0)
            });
            acceptedPools++;
        }

        console.log(`[PancakeSwap] Final accepted pools: ${acceptedPools}`);
    }

    /**
     * Cache pools discovered from factory `poolCreateds` events. The factory
     * subgraph has no liquidity/age data, so only structural validity and the
     * token whitelist are enforced here; liquidity, age, and sanity are
     * enforced downstream (on-chain quote + spread/profit checks). Returns the
     * number of pools added.
     */
    private cachePancakePoolCreateds(createds: any[]): number {
        // Prefer pools touching known/universe tokens so the watcher's fixed
        // pairs are covered even when the recent-events window is spammed by
        // brand-new memecoin pools.
        const universe = new Set(
            getActiveUniverse().tokens.map((t: string) => t.toLowerCase())
        );
        const relevant = createds.filter(pc => {
            const t0 = (typeof pc?.token0 === "string" ? pc.token0 : pc?.token0?.id)?.toLowerCase();
            const t1 = (typeof pc?.token1 === "string" ? pc.token1 : pc?.token1?.id)?.toLowerCase();
            return (t0 && universe.has(t0)) || (t1 && universe.has(t1));
        });
        // Relevant (universe-token) pools first, then the rest; cap the rest so
        // one noisy launch window cannot flood the cache.
        const others = createds.filter(pc => !relevant.includes(pc));
        const ordered = [...relevant, ...others.slice(0, 100)];

        let accepted = 0;
        for (const pc of ordered) {
            const pool = pc?.pool;
            const token0 = typeof pc?.token0 === "string" ? pc.token0 : pc?.token0?.id;
            const token1 = typeof pc?.token1 === "string" ? pc.token1 : pc?.token1?.id;
            const fee = Number(pc?.fee);
            if (!pool || !token0 || !token1) continue;
            if (Number.isNaN(fee) || fee <= 0) continue;

            // Respect the whitelist when one is configured (same bridge-token
            // rule as isEligiblePool).
            if (this.whitelistSet.size > 0) {
                const t0 = token0.toLowerCase();
                const t1 = token1.toLowerCase();
                if (!this.whitelistSet.has(t0) && !this.whitelistSet.has(t1)) continue;
            }

            this.cache.add({
                dex: "PANCAKESWAP",
                pool,
                token0,
                token1,
                fee,
                createdAtTimestamp: Number(pc?.blockTimestamp ?? 0)
            });
            accepted++;
        }
        return accepted;
    }

    /**
     * Load the exact PancakeSwap pools for one token pair from the factory
     * subgraph. Use this to guarantee a watched pair is present even when it
     * falls outside the recent-events window of the broad loadPancakeSwap
     * fallback. No-op against endpoints that are not the factory schema.
     */
    public async loadPancakeSwapPair(
        subgraphUrl: string,
        tokenA: string,
        tokenB: string
    ): Promise<number> {
        const result = await this.querySubgraph(
            subgraphUrl,
            PANCAKESWAP_POOL_CREATEDS_PAIR_QUERY,
            { t0: tokenA.toLowerCase(), t1: tokenB.toLowerCase() }
        );
        const createds = result?.data?.poolCreateds;
        if (!Array.isArray(createds)) return 0;
        return this.cachePancakePoolCreateds(createds);
    }

    public async loadBridgeTokenPools(
        subgraphUrl: string,
        targetTokens: string[] = BRIDGE_TOKENS
    ): Promise<void> {
        // Try Uniswap subgraph first
        const uniswapQuery = `
        query bridgeTokenPools($tokens: [String!]!) {
          pools(
            first: 100,
            orderBy: volumeUSD,
            orderDirection: desc,
            where: {
              or: [
                { token0_in: $tokens },
                { token1_in: $tokens }
              ],
              totalValueLockedUSD_gte: 1000
            }
          ) {
            id
            token0 { id }
            token1 { id }
            feeTier
            totalValueLockedUSD
            volumeUSD
            createdAtTimestamp
          }
        }
        `;

        try {
            const result = await this.querySubgraph(
                subgraphUrl,
                uniswapQuery,
                { tokens: targetTokens }
            );

            const pools = result?.data?.pools;
            if (Array.isArray(pools)) {
                for (const pool of pools) {
                    const token0 = pool?.token0?.id;
                    const token1 = pool?.token1?.id;
                    const feeTier = pool?.feeTier;

                    if (!token0 || !token1 || !pool?.id) {
                        continue;
                    }

                    const fee = Number(feeTier ?? 3000);
                    if (Number.isNaN(fee) || fee <= 0) {
                        continue;
                    }

                    this.cache.add({
                        dex: "UNISWAP",
                        pool: pool.id,
                        token0,
                        token1,
                        fee,
                        totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                        volumeUSD: Number(pool.volumeUSD ?? 0),
                        createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0)
                    });
                }
            }
        } catch (error) {
            // Failed to load Uniswap bridge token pools
        }
    }

    private isEligiblePool(pool: any): boolean {
        const volumeUsd = Number(pool?.volumeUSD ?? 0);
        const liquidityUsd = Math.max(
            Number(pool?.totalValueLockedUSD ?? 0),
            Number(pool?.reserveUSD ?? 0)
        );
        const createdAtTimestamp = Number(pool?.createdAtTimestamp ?? 0);
        const token0 = pool?.token0?.id?.toLowerCase();
        const token1 = pool?.token1?.id?.toLowerCase();

        // Check if tokens are in whitelist
        if (!token0 || !token1) {
            return false;
        }

        // At least one token must be in whitelist (bridge token) - only check if whitelist is not empty
        if (this.whitelistSet.size > 0) {
            const token0InWhitelist = this.whitelistSet.has(token0);
            const token1InWhitelist = this.whitelistSet.has(token1);
            
            // At least one token must be in whitelist (bridge token)
            if (!token0InWhitelist && !token1InWhitelist) {
                return false;
            }
        }

        if (volumeUsd < MIN_VOLUME_USD || volumeUsd > MAX_VOLUME_USD) {
            return false;
        }

        if (liquidityUsd < MIN_LIQUIDITY_USD || liquidityUsd > MAX_LIQUIDITY_USD) {
            return false;
        }

        // Fail closed: a missing/invalid timestamp is treated as a brand-new
        // pool rather than allowing it to bypass the minimum-age filter.
        const ageSeconds = createdAtTimestamp > 0
            ? Math.floor(Date.now() / 1000) - createdAtTimestamp
            : 0;
        if (ageSeconds < MIN_AGE_SECONDS) {
            return false;
        }

        return true;
    }

    // Subgraph URLs can embed the Graph API key in the path (gateway URLs) or
    // query string, so only ever log the host.
    private redactUrl(url: string): string {
        try {
            return new URL(url).host;
        } catch {
            return "(invalid url)";
        }
    }

    private resolveSubgraphUrl(url: string): string {
        const graphApiKey = process.env.GRAPH_API_KEY;
        if (graphApiKey && url.includes("${GRAPH_API_KEY}")) {
            return url.replace(/\$\{GRAPH_API_KEY\}/g, graphApiKey);
        }
        return url;
    }

    private async querySubgraph(
        url: string,
        query: string,
        variables: Record<string, unknown>
    ): Promise<any> {
        try {
            url = this.resolveSubgraphUrl(url);
            const graphApiKey = process.env.GRAPH_API_KEY;
            const headers: Record<string, string> = {
                "Content-Type": "application/json"
            };
            if (graphApiKey) {
                headers["Authorization"] = `Bearer ${graphApiKey}`;
            }

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                const body = await response.text().catch(() => "");
                console.error(`[Subgraph] HTTP ${response.status} from ${this.redactUrl(url)}: ${body.slice(0, 200)}`);
                return null;
            }

            const json = await response.json();
            if (json.errors) {
                console.error(`[Subgraph] GraphQL errors:`, JSON.stringify(json.errors).slice(0, 300));
            }
            return json;
        } catch (error) {
            console.error(`[Subgraph] Request failed:`, error instanceof Error ? error.message : error);
            return null;
        }
    }

    /**
     * Build token graph from loaded pools
     * Returns a graph of connected tokens across all DEXes
     */
    public buildTokenGraph(): TokenGraph {
        const pools = this.cache.getAll();
        const tokens = new Set<string>();
        const edges = new Map<string, Set<string>>();
        const dexEdges = new Map<string, Map<string, Set<string>>>();

        console.log(`Building token graph from ${pools.length} pools...`);

        // Debug: Count pools by DEX for specific tokens
        const targetTokens = ['0x8335', '0x0b3e', '0x4200'];
        const dexPoolCounts = new Map<string, Map<string, number>>();
        
        for (const pool of pools) {
            const { token0, token1, dex } = pool;
            
            // Check if this pool contains target tokens
            const t0 = token0.toLowerCase();
            const t1 = token1.toLowerCase();
            
            for (const target of targetTokens) {
                if (t0 === target || t1 === target) {
                    if (!dexPoolCounts.has(target)) {
                        dexPoolCounts.set(target, new Map());
                    }
                    const targetMap = dexPoolCounts.get(target)!;
                    targetMap.set(dex, (targetMap.get(dex) || 0) + 1);
                }
            }
            
            // Add tokens
            tokens.add(token0.toLowerCase());
            tokens.add(token1.toLowerCase());

            // Normalize DEX names to match provider names
            const normalizedDex = dex.toUpperCase();
            const dexNameMap: { [key: string]: string } = {
                'UNISWAP': 'UniswapV3',
                'SUSHISWAP': 'SushiSwap',
                'PANCAKESWAP': 'PancakeSwap',
                'AERODROME': 'Aerodrome'
            };
            const normalizedDexName = dexNameMap[normalizedDex] || dex;
            
            // Initialize DEX edges if needed
            if (!dexEdges.has(normalizedDexName)) {
                dexEdges.set(normalizedDexName, new Map());
            }
            const dexMap = dexEdges.get(normalizedDexName)!;

            // Initialize token edges if needed
            if (!edges.has(token0.toLowerCase())) {
                edges.set(token0.toLowerCase(), new Set());
            }
            if (!edges.has(token1.toLowerCase())) {
                edges.set(token1.toLowerCase(), new Set());
            }

            // Initialize DEX-specific token edges if needed
            if (!dexMap.has(token0.toLowerCase())) {
                dexMap.set(token0.toLowerCase(), new Set());
            }
            if (!dexMap.has(token1.toLowerCase())) {
                dexMap.set(token1.toLowerCase(), new Set());
            }

            // Add bidirectional edges
            edges.get(token0.toLowerCase())!.add(token1.toLowerCase());
            edges.get(token1.toLowerCase())!.add(token0.toLowerCase());

            // Add DEX-specific bidirectional edges
            dexMap.get(token0.toLowerCase())!.add(token1.toLowerCase());
            dexMap.get(token1.toLowerCase())!.add(token0.toLowerCase());
        }

        console.log(`Built graph: ${tokens.size} tokens, ${this.countEdges(edges)} edges`);
        
        // Debug: Show pool counts for target tokens
        console.log("\n=== Target Token Pool Counts ===");
        for (const [token, dexMap] of dexPoolCounts.entries()) {
            console.log(`  ${token.slice(0,6)}:`);
            for (const [dex, count] of dexMap.entries()) {
                // Normalize DEX name for display
                const normalizedDex = dex.toUpperCase();
                const dexNameMap: { [key: string]: string } = {
                    'UNISWAP': 'UniswapV3',
                    'SUSHISWAP': 'SushiSwap',
                    'PANCAKESWAP': 'PancakeSwap',
                    'AERODROME': 'Aerodrome'
                };
                const normalizedDexName = dexNameMap[normalizedDex] || dex;
                console.log(`    ${normalizedDexName}: ${count} pools`);
            }
        }
        
        // Show some example connections
        const tokenArray = Array.from(tokens).slice(0, 5);
        console.log("Example token connections:");
        for (const token of tokenArray) {
            const connections = edges.get(token);
            if (connections && connections.size > 0) {
                console.log(`  ${token.slice(0,6)} → ${Array.from(connections).slice(0, 3).map(t => t.slice(0,6)).join(', ')}`);
            }
        }

        return { tokens, edges, dexEdges };
    }

    /**
     * Generate triangles with quality-based bridge token selection
     * Uses graph connectivity and filters by liquidity, volume, and pool quality
     */
    private generateQualityAwareTriangles(
        usdcLower: string,
        wethLower: string,
        dexEdges: Map<string, Map<string, Set<string>>>,
        pools: PoolInfo[]
    ): string[][] {
        const triangles: string[][] = [];
        
        console.log("\n=== Quality-Aware Triangle Generation ===");
        
        // Quality thresholds (user-specified values)
        const MIN_LIQUIDITY_USD = 10000; // $10k minimum liquidity per pool
        const MIN_VOLUME_24H_USD = 1000; // $1k minimum 24h volume
        const MIN_POOL_AGE_DAYS = 7; // 7 days minimum pool age
        
        // Create pool lookup by token pair
        const poolMap = new Map<string, PoolInfo[]>();
        for (const pool of pools) {
            const key = `${pool.token0.toLowerCase()}-${pool.token1.toLowerCase()}`;
            if (!poolMap.has(key)) {
                poolMap.set(key, []);
            }
            poolMap.get(key)!.push(pool);
        }
        
        // Get bridge tokens from pool data directly (more accurate than graph)
        const bridgeTokens = new Set<string>();
        
        // Find tokens that have pools with USDC AND pools with WETH
        for (const pool of pools) {
            const token0 = pool.token0.toLowerCase();
            const token1 = pool.token1.toLowerCase();
            
            // Check if this pool involves USDC
            if (token0 === usdcLower || token1 === usdcLower) {
                const otherToken = token0 === usdcLower ? token1 : token0;
                // Check if this other token also has a pool with WETH
                for (const checkPool of pools) {
                    const checkToken0 = checkPool.token0.toLowerCase();
                    const checkToken1 = checkPool.token1.toLowerCase();
                    if ((checkToken0 === otherToken && checkToken1 === wethLower) ||
                        (checkToken1 === otherToken && checkToken0 === wethLower)) {
                        bridgeTokens.add(otherToken);
                        break;
                    }
                }
            }
        }
        
        // Deduplicate bridge tokens to avoid duplicates
        const uniqueBridgeTokens = new Set(bridgeTokens);
        console.log(`Found ${uniqueBridgeTokens.size} unique potential bridge tokens from pool data`);
        
        // Filter bridge tokens by quality AND provider availability
        const qualityBridgeTokens: Array<{ token: string; score: number }> = [];
        
        for (const bridgeToken of uniqueBridgeTokens) {
            // Check pool quality for USDC → bridge
            const usdcBridgeKey1 = `${usdcLower}-${bridgeToken}`;
            const usdcBridgeKey2 = `${bridgeToken}-${usdcLower}`;
            const usdcBridgePools = poolMap.get(usdcBridgeKey1) || poolMap.get(usdcBridgeKey2) || [];
            
            // Check pool quality for bridge → WETH
            const bridgeWethKey1 = `${bridgeToken}-${wethLower}`;
            const bridgeWethKey2 = `${wethLower}-${bridgeToken}`;
            const bridgeWethPools = poolMap.get(bridgeWethKey1) || poolMap.get(bridgeWethKey2) || [];
            
            // Calculate quality score
            let totalLiquidity = 0;
            let totalVolume = 0;
            let validPools = 0;
            const now = Math.floor(Date.now() / 1000);
            
            for (const pool of [...usdcBridgePools, ...bridgeWethPools]) {
                const liquidity = pool.reserveUSD || pool.totalValueLockedUSD || 0;
                const volume = pool.volumeUSD || 0;
                const ageSeconds = pool.createdAtTimestamp ? now - pool.createdAtTimestamp : 0;
                const ageDays = ageSeconds / 86400;
                
                if (liquidity >= MIN_LIQUIDITY_USD && ageDays >= MIN_POOL_AGE_DAYS) {
                    totalLiquidity += liquidity;
                    validPools++;
                }
                
                if (volume >= MIN_VOLUME_24H_USD) {
                    totalVolume += volume;
                }
            }
            
            // Skip provider availability check - discovery engine will handle it
            // Debug logging for first few tokens
            if (qualityBridgeTokens.length < 3) {
                console.log(`  Debug for ${bridgeToken.slice(0,6)}:`);
                console.log(`    USDC→Bridge pools: ${usdcBridgePools.length}`);
                console.log(`    Bridge→WETH pools: ${bridgeWethPools.length}`);
                console.log(`    Total liquidity: $${totalLiquidity.toFixed(0)}`);
            }
            
            // Only consider tokens with valid pools
            if (validPools >= 2 && totalLiquidity >= MIN_LIQUIDITY_USD * 2) {
                const score = totalLiquidity + totalVolume * 10; // Weight liquidity more
                qualityBridgeTokens.push({ token: bridgeToken, score });
            }
        }
        
        // Sort by quality score (descending)
        qualityBridgeTokens.sort((a, b) => b.score - a.score);
        
        console.log(`Quality-filtered bridge tokens: ${qualityBridgeTokens.length}`);
        for (let i = 0; i < Math.min(5, qualityBridgeTokens.length); i++) {
            const { token, score } = qualityBridgeTokens[i];
            console.log(`  ${i + 1}. ${token.slice(0,6)}... (score: ${score.toFixed(0)})`);
        }
        
        // Generate triangles with top quality bridge tokens
        const maxTriangles = 20; // Limit to top 20
        for (let i = 0; i < Math.min(maxTriangles, qualityBridgeTokens.length); i++) {
            const bridgeToken = qualityBridgeTokens[i].token;
            triangles.push([usdcLower, bridgeToken, wethLower]);
        }
        
        console.log(`Generated ${triangles.length} quality-aware triangles`);
        return triangles;
    }
    
    /**
     * Generate triangles using anchor tokens (USDC and WETH)
     * Uses DEX-specific edges to ensure each leg has a valid pool
     * Pattern: USDC → TOKEN → WETH → USDC (can use different DEXes for each leg)
     */
    public generateAnchorTriangles(tokenGraph: TokenGraph): string[][] {
        const { tokens, edges, dexEdges } = tokenGraph;
        const triangles: string[][] = [];
        
        const usdcLower = ANCHOR_TOKENS[0];
        const wethLower = ANCHOR_TOKENS[1];
        
        console.log(`Generating triangles with anchors: USDC (${usdcLower.slice(0,6)}), WETH (${wethLower.slice(0,6)})`);
        
        // Check if anchors exist in graph
        if (!tokens.has(usdcLower) || !tokens.has(wethLower)) {
            console.log("Anchor tokens not found in graph!");
            console.log(`USDC in graph: ${tokens.has(usdcLower)}`);
            console.log(`WETH in graph: ${tokens.has(wethLower)}`);
            return triangles;
        }
        
        // Use quality-aware triangle generation instead of whitelist
        // Pass current pools from the buildTokenGraph context
        const currentPools: PoolInfo[] = [];
        for (const pool of this.cache.getAll()) {
            currentPools.push(pool);
        }
        
        const qualityTriangles = this.generateQualityAwareTriangles(
            usdcLower, 
            wethLower, 
            dexEdges, 
            currentPools
        );
        
        if (qualityTriangles.length > 0) {
            return qualityTriangles;
        }
        
        // Fallback to existing logic if quality-aware generation fails
        console.log("Quality-aware generation failed, falling back to existing logic");
        
        // Get DEX-specific edges (using normalized names) for fallback
        const uniswapEdges = dexEdges.get("UniswapV3");
        const aerodromeEdges = dexEdges.get("Aerodrome") ?? new Map<string, Set<string>>();
        const pancakeswapEdges = dexEdges.get("PancakeSwap");
        
        if (!uniswapEdges) {
            console.log("Missing DEX edge data");
            return triangles;
        }
        
        // Allow single-DEX triangles for testing
        if (!aerodromeEdges && !pancakeswapEdges) {
            console.log("Aerodrome and PancakeSwap not available, using Uniswap-only triangles");
            // Generate simple Uniswap triangles
            const usdcConnected = uniswapEdges.get(usdcLower) || new Set();
            const wethConnected = uniswapEdges.get(wethLower) || new Set();
            
            console.log(`DEBUG: USDC connected tokens: ${usdcConnected.size}`);
            console.log(`DEBUG: WETH connected tokens: ${wethConnected.size}`);
            console.log(`DEBUG: Sample USDC connections:`, Array.from(usdcConnected).slice(0, 5));
            console.log(`DEBUG: Sample WETH connections:`, Array.from(wethConnected).slice(0, 5));
            
            // Find bridge tokens on Uniswap
            const bridgeTokens = Array.from(usdcConnected).filter(t => 
                wethConnected.has(t) &&
                t !== "0x0000000000000000000000000000000000000000" && // Filter zero address
                t !== "0x0000" // Filter truncated zero address
            );
            
            // If whitelist is enabled, filter for whitelist tokens
            let filteredBridgeTokens = bridgeTokens;
            if (this.whitelistSet.size > 0) {
                filteredBridgeTokens = bridgeTokens.filter(t => this.whitelistSet.has(t));
                console.log(`Uniswap bridge tokens (whitelist filter): ${filteredBridgeTokens.length}/${bridgeTokens.length}`);
                if (filteredBridgeTokens.length === 0) {
                    console.log(`⚠️ No whitelist tokens found in bridge tokens`);
                    console.log(`Whitelist tokens: ${Array.from(this.whitelistSet).slice(0, 5).map(t => t.slice(0,6)).join(', ')}...`);
                }
            }
            
            // Use filtered tokens only (strict mode - no fallback)
            const finalBridgeTokens = filteredBridgeTokens;
            
            console.log(`Uniswap bridge tokens: ${finalBridgeTokens.length}`);
            for (const bridge of finalBridgeTokens.slice(0, 10)) {
                console.log(`  Generated triangle: ${usdcLower.slice(0,6)} → ${bridge.slice(0,6)} → ${wethLower.slice(0,6)}`);
                triangles.push([usdcLower, bridge, wethLower]);
            }
            
            console.log(`Generated ${triangles.length} triangles using Uniswap-only pattern`);
            
            // Deduplicate triangles
            const uniqueTriangles = this.deduplicateTriangles(triangles);
            console.log(`Deduplicated to ${uniqueTriangles.length} unique triangles`);
            
            return uniqueTriangles;
        }
        
        // Cross-DEX with PancakeSwap
        if (pancakeswapEdges && !aerodromeEdges) {
            console.log("Using Uniswap + PancakeSwap for cross-DEX triangles");
            const uniswapUsdc = uniswapEdges.get(usdcLower) || new Set();
            const uniswapWeth = uniswapEdges.get(wethLower) || new Set();
            const pancakeUsdc = pancakeswapEdges.get(usdcLower) || new Set();
            const pancakeWeth = pancakeswapEdges.get(wethLower) || new Set();
            
            // Find bridge tokens on PancakeSwap
            const pancakeBridgeTokens = Array.from(pancakeUsdc).filter(t => 
                pancakeWeth.has(t) &&
                t !== "0x0000000000000000000000000000000000000000" && // Filter zero address
                t !== "0x0000" // Filter truncated zero address
            );
            
            // If whitelist is enabled, filter for whitelist tokens
            let filteredBridgeTokens = pancakeBridgeTokens;
            if (this.whitelistSet.size > 0) {
                filteredBridgeTokens = pancakeBridgeTokens.filter(t => this.whitelistSet.has(t));
                console.log(`PancakeSwap bridge tokens (whitelist filter): ${filteredBridgeTokens.length}/${pancakeBridgeTokens.length}`);
                if (filteredBridgeTokens.length === 0) {
                    console.log(`⚠️ No whitelist tokens found in bridge tokens`);
                    console.log(`Whitelist tokens: ${Array.from(this.whitelistSet).slice(0, 5).map(t => t.slice(0,6)).join(', ')}...`);
                }
            }
            
            // Use filtered tokens only (strict mode - no fallback)
            const finalBridgeTokens = filteredBridgeTokens;
            
            console.log(`PancakeSwap bridge tokens: ${finalBridgeTokens.length}`);
            for (const bridge of finalBridgeTokens.slice(0, 10)) {
                console.log(`  Generated triangle: USDC → ${bridge.slice(0,6)} → WETH`);
                triangles.push([usdcLower, bridge, wethLower]);
            }
            
            console.log(`Generated ${triangles.length} triangles using Uniswap+PancakeSwap pattern`);
            
            // Deduplicate triangles
            const uniqueTriangles = this.deduplicateTriangles(triangles);
            console.log(`Deduplicated to ${uniqueTriangles.length} unique triangles`);
            
            return uniqueTriangles;
        }
        
        // Find tokens that can form triangles across DEXes
        // Pattern: USDC → Token → WETH → USDC
        // Each leg can use different DEX

        // Get all tokens connected to USDC on any DEX
        const usdcConnectedOnUniswap = uniswapEdges.get(usdcLower) || new Set();
        const usdcConnectedOnAerodrome = aerodromeEdges.get(usdcLower) || new Set();
        const usdcConnectedOnPancake = pancakeswapEdges?.get(usdcLower) || new Set();
        const allUsdcConnected = new Set([...usdcConnectedOnUniswap, ...usdcConnectedOnAerodrome, ...usdcConnectedOnPancake]);
        
        // Get all tokens connected to WETH on any DEX
        const wethConnectedOnUniswap = uniswapEdges.get(wethLower) || new Set();
        const wethConnectedOnAerodrome = aerodromeEdges.get(wethLower) || new Set();
        const wethConnectedOnPancake = pancakeswapEdges?.get(wethLower) || new Set();
        const allWethConnected = new Set([...wethConnectedOnUniswap, ...wethConnectedOnAerodrome, ...wethConnectedOnPancake]);
        
        console.log(`USDC connected to ${allUsdcConnected.size} tokens across all DEXes`);
        console.log(`WETH connected to ${allWethConnected.size} tokens across all DEXes`);
        
        // Debug: Manual bridge token extraction from pool cache
        console.log("\n=== Manual Bridge Token Extraction (from pool cache) ===");
        const aerodromeUsdcTokens = new Set<string>();
        const aerodromeWethTokens = new Set<string>();
        
        for (const pool of this.cache.getAll()) {
            if (pool.dex !== "SUSHISWAP") continue;

            const t0 = pool.token0.toLowerCase();
            const t1 = pool.token1.toLowerCase();

            if (t0 === usdcLower) {
                aerodromeUsdcTokens.add(t1);
            } else if (t1 === usdcLower) {
                aerodromeUsdcTokens.add(t0);
            }

            if (t0 === wethLower) {
                aerodromeWethTokens.add(t1);
            } else if (t1 === wethLower) {
                aerodromeWethTokens.add(t0);
            }
        }
        
        const manualBridgeTokens = [...aerodromeUsdcTokens].filter(
            token => aerodromeWethTokens.has(token)
        );
        
        console.log(`Manual extraction - Aerodrome USDC tokens: ${aerodromeUsdcTokens.size}`);
        console.log(`Manual extraction - Aerodrome WETH tokens: ${aerodromeWethTokens.size}`);
        console.log(`Manual extraction - Bridge tokens (intersection): ${manualBridgeTokens.length}`);
        manualBridgeTokens.slice(0, 10).forEach(t => console.log(`  - ${t}`));
        
        // Find bridge tokens (connects to both USDC and WETH on Aerodrome)
        const aerodromeUsdc = aerodromeEdges.get(usdcLower) || new Set();
        const aerodromeWeth = aerodromeEdges.get(wethLower) || new Set();
        const aerodromeBridgeTokens = Array.from(aerodromeUsdc).filter(t => 
            aerodromeWeth.has(t) && 
            t !== "0x0000000000000000000000000000000000000000000" && // Filter zero address
            t !== "0x0000" // Filter truncated zero address
        );
        
        console.log(`Graph-based extraction - Aerodrome bridge tokens: ${aerodromeBridgeTokens.length}`);
        console.log(`Comparison: Manual (${manualBridgeTokens.length}) vs Graph (${aerodromeBridgeTokens.length})`);
        
        // If whitelist is enabled, filter for whitelist tokens
        let filteredAerodromeBridgeTokens = aerodromeBridgeTokens;
        if (this.whitelistSet.size > 0) {
            filteredAerodromeBridgeTokens = aerodromeBridgeTokens.filter(t => this.whitelistSet.has(t));
            console.log(`Aerodrome bridge tokens (whitelist filter): ${filteredAerodromeBridgeTokens.length}/${aerodromeBridgeTokens.length}`);
            if (filteredAerodromeBridgeTokens.length === 0) {
                console.log(`⚠️ No whitelist tokens found in Aerodrome bridge tokens`);
                console.log(`Whitelist tokens: ${Array.from(this.whitelistSet).slice(0, 5).map(t => t.slice(0,6)).join(', ')}...`);
            }
        }
        
        // Use filtered tokens only (strict mode - no fallback)
        const finalAerodromeBridgeTokens = filteredAerodromeBridgeTokens;
        
        console.log(`Aerodrome bridge tokens: ${finalAerodromeBridgeTokens.length}`);
        finalAerodromeBridgeTokens.forEach(t => console.log(`  - ${t.slice(0,6)}`));
        
        // For each bridge token, try to form triangle
        for (const bridgeToken of finalAerodromeBridgeTokens) {
            // Triangle: USDC → bridgeToken → WETH → USDC
            // Check if we can close the loop (WETH → USDC on Uniswap)
            const canCloseLoop = (uniswapEdges.get(wethLower)?.has(usdcLower) || uniswapEdges.get(usdcLower)?.has(wethLower));
            
            if (canCloseLoop) {
                triangles.push([usdcLower, bridgeToken, wethLower]);
                console.log(`  Generated triangle: USDC → ${bridgeToken.slice(0,6)} → WETH`);
            }
        }
        
        // If Aerodrome produced no triangles, try PancakeSwap
        if (triangles.length === 0 && pancakeswapEdges) {
            console.log("Aerodrome produced no triangles, trying PancakeSwap");
            const pancakeUsdc = pancakeswapEdges.get(usdcLower) || new Set();
            const pancakeWeth = pancakeswapEdges.get(wethLower) || new Set();
            const pancakeBridgeTokens = Array.from(pancakeUsdc).filter(t => 
                pancakeWeth.has(t) &&
                t !== "0x0000000000000000000000000000000000000000000" &&
                t !== "0x0000"
            );
            
            // If whitelist is enabled, filter for whitelist tokens
            let filteredPancakeBridgeTokens = pancakeBridgeTokens;
            if (this.whitelistSet.size > 0) {
                filteredPancakeBridgeTokens = pancakeBridgeTokens.filter(t => this.whitelistSet.has(t));
                console.log(`PancakeSwap bridge tokens (whitelist filter): ${filteredPancakeBridgeTokens.length}/${pancakeBridgeTokens.length}`);
                if (filteredPancakeBridgeTokens.length === 0) {
                    console.log(`⚠️ No whitelist tokens found in PancakeSwap bridge tokens`);
                }
            }
            
            // Use filtered tokens only (strict mode - no fallback)
            const finalPancakeBridgeTokens = filteredPancakeBridgeTokens;
            
            console.log(`PancakeSwap bridge tokens: ${finalPancakeBridgeTokens.length}`);
            for (const bridgeToken of finalPancakeBridgeTokens.slice(0, 10)) {
                // Triangle: USDC → bridgeToken → WETH → USDC
                // Check if we can close the loop (WETH → USDC on Uniswap)
                const canCloseLoop = (uniswapEdges.get(wethLower)?.has(usdcLower) || uniswapEdges.get(usdcLower)?.has(wethLower));
                
                if (canCloseLoop) {
                    triangles.push([usdcLower, bridgeToken, wethLower]);
                    console.log(`  Generated triangle: USDC → ${bridgeToken.slice(0,6)} → WETH`);
                }
            }
        }
        
        // Try Uniswap-only triangles (single DEX) regardless of cross-DEX results
        // This increases triangle count for better discovery
        if (uniswapEdges) {
            console.log("Adding Uniswap-only triangles for better discovery");
            const uniswapUsdc = uniswapEdges.get(usdcLower) || new Set();
            const uniswapWeth = uniswapEdges.get(wethLower) || new Set();
            const uniswapBridgeTokens = Array.from(uniswapUsdc).filter(t => 
                uniswapWeth.has(t) &&
                t !== "0x0000000000000000000000000000000000000000000" &&
                t !== "0x0000"
            );
            
            // If whitelist is enabled, filter for whitelist tokens
            let filteredUniswapBridgeTokens = uniswapBridgeTokens;
            if (this.whitelistSet.size > 0) {
                filteredUniswapBridgeTokens = uniswapBridgeTokens.filter(t => this.whitelistSet.has(t));
                console.log(`Uniswap bridge tokens (whitelist filter): ${filteredUniswapBridgeTokens.length}/${uniswapBridgeTokens.length}`);
                if (filteredUniswapBridgeTokens.length === 0) {
                    console.log(`⚠️ No whitelist tokens found in Uniswap bridge tokens`);
                }
            }
            
            const finalUniswapBridgeTokens = filteredUniswapBridgeTokens;
            
            console.log(`Uniswap bridge tokens: ${finalUniswapBridgeTokens.length}`);
            for (const bridge of finalUniswapBridgeTokens.slice(0, 20)) { // Increased to 20 for more discovery
                console.log(`  Generated triangle: ${usdcLower.slice(0,6)} → ${bridge.slice(0,6)} → ${wethLower.slice(0,6)}`);
                triangles.push([usdcLower, bridge, wethLower]);
            }
        }
        
        console.log(`Generated ${triangles.length} valid cross-DEX triangles`);
        
        // Deduplicate triangles based on topology and pool identifiers
        const uniqueTriangles = this.deduplicateTriangles(triangles);
        console.log(`Deduplicated to ${uniqueTriangles.length} unique triangles`);
        
        return uniqueTriangles;
    }
    
    /**
     * Deduplicate triangles based on topology and pool identifiers
     * Ensures triangles with same pools but different order are not counted as duplicates
     */
    private deduplicateTriangles(triangles: string[][]): string[][] {
        const uniqueTriangles = new Map<string, string[]>();
        
        // Deduplicate triangles based on topology and pool identifiers
        for (const triangle of triangles) {
            const identifier = this.getTriangleIdentifier(triangle, this.cache);
            if (!uniqueTriangles.has(identifier)) {
                uniqueTriangles.set(identifier, triangle);
            }
        }
        
        return Array.from(uniqueTriangles.values());
    }

    /**
     * Generate cross-DEX arbitrage pairs
     * Returns token pairs that have pools on both Aerodrome and Uniswap
     * This is simpler than triangles and more likely to find opportunities
     */
    public generateCrossDexPairs(tokenGraph: TokenGraph): string[][] {
        const { dexEdges } = tokenGraph;
        const pairs: string[][] = [];

        console.log("Generating cross-DEX arbitrage pairs...");

        const aerodromeEdges = dexEdges.get("Aerodrome") ?? new Map<string, Set<string>>();
        const uniswapEdges = dexEdges.get("UniswapV3");

        if (!aerodromeEdges || !uniswapEdges) {
            console.log("Missing DEX edge data");
            return pairs;
        }

        // Find pairs that exist on both DEXes
        for (const [tokenA, connections] of aerodromeEdges) {
            for (const tokenB of connections) {
                // Check if this pair also exists on Uniswap
                const uniswapHasPair = uniswapEdges.get(tokenA)?.has(tokenB) || 
                                       uniswapEdges.get(tokenB)?.has(tokenA);
                
                if (uniswapHasPair) {
                    pairs.push([tokenA, tokenB]);
                }
            }
        }

        // Remove duplicates
        const uniquePairs = new Set<string>();
        const filteredPairs: string[][] = [];
        
        for (const pair of pairs) {
            const sorted = pair.sort().join("-");
            if (!uniquePairs.has(sorted)) {
                uniquePairs.add(sorted);
                filteredPairs.push(pair);
            }
        }

        console.log(`Generated ${filteredPairs.length} cross-DEX pairs`);
        return filteredPairs;
    }
}
