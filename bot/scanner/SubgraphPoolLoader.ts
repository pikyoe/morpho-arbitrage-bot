import { PoolCache } from "./PoolCache.js";
import { PoolInfo } from "./PoolTypes.js";

const DEFAULT_POOL_LIMIT = 50;
const MIN_VOLUME_USD = 30000;
const MAX_VOLUME_USD = 500000;
const MIN_LIQUIDITY_USD = 15000;
const MAX_LIQUIDITY_USD = 300000;
const MIN_AGE_SECONDS = 3 * 24 * 60 * 60; // 3 days

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

const AERODROME_TOP_POOLS_QUERY = `
query topPools(
  $first: Int!,
  $minReserveUsd: BigDecimal!,
  $maxReserveUsd: BigDecimal!,
  $minVolumeUsd: BigDecimal!,
  $maxVolumeUsd: BigDecimal!
) {
  pools(
    first: $first,
    orderBy: volumeUSD,
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
    stable
    reserveUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

const AERODROME_TOP_PAIRS_QUERY = `
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
    stable
    reserveUSD
    volumeUSD
    createdAtTimestamp
  }
}
`;

export class SubgraphPoolLoader {
    constructor(
        private readonly cache: PoolCache
    ) {}

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
            console.warn("Uniswap subgraph returned unexpected data format");
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
                totalValueLockedUSD: Number(pool.totalValueLockedUSD ?? 0),
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0)
            });
        }

        console.log(`Loaded ${pools.length} Uniswap pools from subgraph`);
    }

    public async loadAerodrome(
        subgraphUrl: string,
        topPools: number = DEFAULT_POOL_LIMIT
    ): Promise<void> {
        let response = await this.querySubgraph(
            subgraphUrl,
            AERODROME_TOP_POOLS_QUERY,
            {
                first: topPools,
                minReserveUsd: MIN_LIQUIDITY_USD,
                maxReserveUsd: MAX_LIQUIDITY_USD,
                minVolumeUsd: MIN_VOLUME_USD,
                maxVolumeUsd: MAX_VOLUME_USD
            }
        );

        let pools = response?.data?.pools;

        if (!Array.isArray(pools) || pools.length === 0) {
            response = await this.querySubgraph(
                subgraphUrl,
                AERODROME_TOP_PAIRS_QUERY,
                {
                    first: topPools,
                    minReserveUsd: MIN_LIQUIDITY_USD,
                    maxReserveUsd: MAX_LIQUIDITY_USD,
                    minVolumeUsd: MIN_VOLUME_USD,
                    maxVolumeUsd: MAX_VOLUME_USD
                }
            );
            pools = response?.data?.pairs;
        }

        if (!Array.isArray(pools)) {
            console.warn("Aerodrome subgraph returned unexpected data format");
            return;
        }

        for (const pool of pools) {
            const token0 = pool?.token0?.id;
            const token1 = pool?.token1?.id;
            const stable = pool?.stable ?? false;

            if (!token0 || !token1 || !pool?.id) {
                continue;
            }

            if (!this.isEligiblePool(pool)) {
                continue;
            }

            this.cache.add({
                dex: "AERODROME",
                pool: pool.id,
                token0,
                token1,
                stable: Boolean(stable),
                reserveUSD: Number(pool.reserveUSD ?? 0),
                volumeUSD: Number(pool.volumeUSD ?? 0),
                createdAtTimestamp: Number(pool.createdAtTimestamp ?? 0)
            });
        }

        console.log(`Loaded ${pools.length} Aerodrome pools from subgraph`);
    }

    private isEligiblePool(pool: any): boolean {
        const volumeUsd = Number(pool?.volumeUSD ?? 0);
        const liquidityUsd = Number(pool?.totalValueLockedUSD ?? pool?.reserveUSD ?? 0);
        const createdAtTimestamp = Number(pool?.createdAtTimestamp ?? 0);

        if (volumeUsd < MIN_VOLUME_USD || volumeUsd > MAX_VOLUME_USD) {
            return false;
        }

        if (liquidityUsd < MIN_LIQUIDITY_USD || liquidityUsd > MAX_LIQUIDITY_USD) {
            return false;
        }

        if (createdAtTimestamp > 0) {
            const ageSeconds = Math.floor(Date.now() / 1000) - createdAtTimestamp;
            if (ageSeconds < MIN_AGE_SECONDS) {
                return false;
            }
        }

        return true;
    }

    private async querySubgraph(
        url: string,
        query: string,
        variables: Record<string, unknown>
    ): Promise<any> {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ query, variables })
            });

            if (!response.ok) {
                throw new Error(`GraphQL request failed ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.warn("Failed to query subgraph:", error instanceof Error ? error.message : error);
            return null;
        }
    }
}
