import { PoolInfo } from "./PoolTypes.js";

export class PoolCache {

    private pools: PoolInfo[] = [];

    add(pool: PoolInfo): void {

        this.pools.push(pool);

    }

    getAll(): PoolInfo[] {

        return [...this.pools];

    }

    clear(): void {

        this.pools = [];

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