import type { Pool } from "./types.js";

export function getAerodromePools(

    tokenIn: string,

    tokenOut: string

): Pool[] {

    return [

        {

            dex: "Aerodrome",

            pool: "volatile",

            tokenIn,

            tokenOut,

            stable: false

        },

        {

            dex: "Aerodrome",

            pool: "stable",

            tokenIn,

            tokenOut,

            stable: true

        }

    ];

}