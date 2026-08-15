import { Contract, Provider } from "ethers";

import { PoolCache } from "../PoolCache.js";
import { PoolStateCache } from "./PoolStateCache.js";
import { PoolInfo } from "../PoolTypes.js";
import { IPoolStateLoader } from "./IPoolStateLoader.js";

import { AERODROME_POOL_ABI } from "../abis/AerodromePool.js";

export class AerodromePoolStateLoader
    implements IPoolStateLoader
{
    private readonly contracts =
        new Map<string, Contract>();

    constructor(

        private readonly provider: Provider,

        private readonly poolCache: PoolCache,

        private readonly stateCache: PoolStateCache

    ) {}

    private getContract(
        address: string
    ): Contract {

        let contract =
            this.contracts.get(address);

        if (!contract) {

            contract =
                new Contract(

                    address,

                    AERODROME_POOL_ABI,

                    this.provider

                );

            this.contracts.set(
                address,
                contract
            );

        }

        return contract;

    }

    async load(): Promise<void> {

        await this.refresh();

    }

    async refresh(): Promise<void> {

        const pools =
            this.poolCache
                .getAll()
                .filter(

                    p =>

                        p.dex === "AERODROME"

                );

        const blockNumber =
            await this.provider.getBlockNumber();

        await Promise.all(

            pools.map(

                pool =>

                    this.loadPool(

                        pool,

                        blockNumber

                    )

            )

        );

    }

    cache(): PoolStateCache {

        return this.stateCache;

    }

    private async loadPool(

        pool: PoolInfo,

        blockNumber: number

    ): Promise<void> {

        try {

            const contract =
                this.getContract(
                    pool.pool
                );

            const [

                reserves

            ] = await Promise.all([

                contract.getReserves()

            ]);

            this.stateCache.set({

                dex: "AERODROME",

                pool: pool.pool,

                token0: pool.token0,

                token1: pool.token1,

                reserve0: reserves[0],

                reserve1: reserves[1],

                stable: pool.stable ?? false,

                blockNumber: BigInt(blockNumber),

                timestamp: Date.now()

            });

        }
        catch (err) {

            console.warn(

                "[AerodromePoolState]",

                pool.pool,

                err instanceof Error

                    ? err.message

                    : err

            );

        }

    }

}