import { PoolState } from "./PoolState.js";

export class PoolStateCache {

    private readonly cache =
        new Map<string, PoolState>();

    ////////////////////////////////////////////////////////
    // BASIC
    ////////////////////////////////////////////////////////

    set(
        state: PoolState
    ): void {

        this.cache.set(
            state.pool.toLowerCase(),
            state
        );

    }

    get(
        pool: string
    ): PoolState | undefined {

        return this.cache.get(
            pool.toLowerCase()
        );

    }

    has(
        pool: string
    ): boolean {

        return this.cache.has(
            pool.toLowerCase()
        );

    }

    remove(
        pool: string
    ): boolean {

        return this.cache.delete(
            pool.toLowerCase()
        );

    }

    clear(): void {

        this.cache.clear();

    }

    ////////////////////////////////////////////////////////
    // LIST
    ////////////////////////////////////////////////////////

    getAll(): PoolState[] {

        return [...this.cache.values()];

    }

    size(): number {

        return this.cache.size;

    }

    ////////////////////////////////////////////////////////
    // UPDATE
    ////////////////////////////////////////////////////////

    update(
        pool: string,
        partial: Partial<PoolState>
    ): void {

        const current =
            this.get(pool);

        if (!current) {

            throw new Error(

                `PoolState not found: ${pool}`

            );

        }

        this.set({

            ...current,

            ...partial

        });

    }

    ////////////////////////////////////////////////////////
    // FILTER
    ////////////////////////////////////////////////////////

    byDex(
        dex: string
    ): PoolState[] {

        return this
            .getAll()
            .filter(

                p =>

                    p.dex === dex

            );

    }

    ////////////////////////////////////////////////////////
    // STATISTICS
    ////////////////////////////////////////////////////////

    statistics() {

        const pools =
            this.getAll();

        return {

            total:
                pools.length,

            uniswap:
                pools.filter(
                    p => p.dex === "UNISWAP"
                ).length,

            aerodrome:
                pools.filter(
                    p => p.dex === "AERODROME"
                ).length

        };

    }

}