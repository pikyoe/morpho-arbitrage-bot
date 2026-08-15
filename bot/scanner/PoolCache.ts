import { PoolInfo } from "./PoolTypes.js";

export class PoolCache {

    private pools: PoolInfo[] = [];
    private poolAddresses: Set<string> = new Set(); // Track pool addresses for deduplication

    add(pool: PoolInfo): void {
        const addressKey = pool.pool.toLowerCase();
        const existingIndex = this.pools.findIndex(existing => existing.pool.toLowerCase() === addressKey);
        if (existingIndex >= 0) {
            // Merge metadata from multiple loaders. In particular, do not let
            // a later partial/subgraph record erase a valid reserve/TVL value.
            const existing = this.pools[existingIndex];
            for (const key of ["fee", "stable", "factory", "totalValueLockedUSD", "reserveUSD", "volumeUSD", "createdAtTimestamp", "liquidity", "sqrtPriceX96", "tick", "reserve0Raw", "reserve1Raw", "liquiditySource", "liquidityUpdatedBlock"] as const) {
                const incoming = pool[key];
                if (incoming !== undefined && (existing[key] === undefined ||
                    (typeof incoming === "number" && incoming > 0 && (existing[key] as number) <= 0))) {
                    (existing as any)[key] = incoming;
                }
            }
            return;
        }
        
        this.poolAddresses.add(addressKey);
        this.pools.push(pool);
    }

    getAll(): PoolInfo[] {

        return [...this.pools];

    }

    clear(): void {

        this.pools = [];
        this.poolAddresses.clear();

    }

    size(): number {

        return this.pools.length;

    }

    findPair(
        tokenA: string,
        tokenB: string
    ): PoolInfo[] {

        return this.pools.filter(pool =>

            (
                pool.token0.toLowerCase() === tokenA.toLowerCase()
                &&
                pool.token1.toLowerCase() === tokenB.toLowerCase()

            )

            ||

            (

                pool.token0.toLowerCase() === tokenB.toLowerCase()
                &&
                pool.token1.toLowerCase() === tokenA.toLowerCase()

            )

        );

    }

}
