import type { Pool } from "./types.js";

export function getUniswapPools(

    tokenIn: string,

    tokenOut: string

): Pool[] {

    return [

        {

            dex: "Uniswap",

            pool: "fee500",

            tokenIn,

            tokenOut,

            fee: 500

        },

        {

            dex: "Uniswap",

            pool: "fee3000",

            tokenIn,

            tokenOut,

            fee: 3000

        },

        {

            dex: "Uniswap",

            pool: "fee10000",

            tokenIn,

            tokenOut,

            fee: 10000

        }

    ];

}