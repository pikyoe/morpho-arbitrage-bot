import { Contract, Provider } from "ethers";

import { PoolCache } from "../PoolCache.js";

import { PoolState } from "./PoolState.js";

import { PoolStateCache } from "./PoolStateCache.js";

import { IPoolStateLoader } from "./IPoolStateLoader.js";

import { UNISWAP_V3_POOL_ABI } from "../abis/UniswapV3Pool.js";
import { PoolInfo } from "../PoolTypes.js";

export class UniswapPoolStateLoader
    implements IPoolStateLoader
{

    constructor(

        private readonly provider: Provider,

        private readonly poolCache: PoolCache,

        private readonly stateCache: PoolStateCache

    ) {}

    private readonly contracts =

        new Map<

            string,

            Contract

        >();

    private getContract(

        address: string

    ): Contract {

        let contract =

            this.contracts.get(address);

        if (!contract) {

            contract =

                new Contract(

                    address,

                    UNISWAP_V3_POOL_ABI,

                    this.provider

                );

            this.contracts.set(

                address,

                contract

            );

        }

        return contract;

    }

    cache(): PoolStateCache {

        return this.stateCache;

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

                        p.dex === "UNISWAP"

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

                liquidity,

                slot0

            ] = await Promise.all([

                contract.liquidity(),

                contract.slot0()

            ]);

            const state: PoolState = {

                pool: pool.pool,

                dex: pool.dex,

                token0: pool.token0,

                token1: pool.token1,

                liquidity,

                sqrtPriceX96: slot0.sqrtPriceX96,

                tick: Number(slot0.tick),

                observationIndex:
                    Number(slot0.observationIndex),

                observationCardinality:
                    Number(slot0.observationCardinality),

                observationCardinalityNext:
                    Number(slot0.observationCardinalityNext),

                feeProtocol:
                    Number(slot0.feeProtocol),

                unlocked:
                    slot0.unlocked,

                blockNumber:
                    BigInt(blockNumber),

                timestamp:
                    Date.now()

            };

            this.stateCache.set(state);

        }

        catch (err) {

            console.warn(

                "[PoolState]",

                pool.pool,

                err instanceof Error

                    ? err.message

                    : err

            );

        }

    }

}

