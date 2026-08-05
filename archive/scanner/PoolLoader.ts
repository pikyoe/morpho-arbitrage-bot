import { Contract, ethers } from "ethers";

import { PoolCache } from "./PoolCache.js";
import { TOKEN_ARRAY } from "./TokenList.js";

import { UNISWAP_FACTORY_ABI } from "./abis/UniswapFactory.js";
import { AERODROME_FACTORY_ABI } from "./abis/AerodromeFactory.js";

const FEES = [

    100,
    500,
    3000,
    10000

];

const STABLES = [

    false,

    true

];

export class PoolLoader {

    constructor(

        private readonly provider: any,

        private readonly cache: PoolCache

    ) {}

    async loadUniswap(
        factoryAddress: string
    ) {

        const factory = new Contract(

            factoryAddress,

            UNISWAP_FACTORY_ABI,

            this.provider

        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {

                const tokenA = TOKEN_ARRAY[i];

                const tokenB = TOKEN_ARRAY[j];

                for (const fee of FEES) {

                    const pool = await factory.getPool(

                        tokenA,

                        tokenB,

                        fee

                    );

                    if (
                        pool ===
                        "0x0000000000000000000000000000000000000000"
                    ) {
                        continue;
                    }

                    this.cache.add({

                        dex: "UNISWAP",

                        pool,

                        token0: tokenA,

                        token1: tokenB,

                        fee

                    });

                }

            }

        }

    }

    async loadAerodrome(
        factoryAddress: string
    ) {

        const factory = new Contract(

            factoryAddress,

            AERODROME_FACTORY_ABI,

            this.provider

        );

        for (let i = 0; i < TOKEN_ARRAY.length; i++) {

            for (let j = i + 1; j < TOKEN_ARRAY.length; j++) {

                const tokenA = TOKEN_ARRAY[i];

                const tokenB = TOKEN_ARRAY[j];

                for (const stable of STABLES) {

                    const pool = await factory.getPool(

                        tokenA,

                        tokenB,

                        stable

                    );

                    if (pool === ethers.ZeroAddress) {
                        continue;
                    }

                    this.cache.add({

                        dex: "AERODROME",

                        pool,

                        token0: tokenA,

                        token1: tokenB,

                        stable,

                        factory: factoryAddress

                    });

                }

            }

        }

    }

}

