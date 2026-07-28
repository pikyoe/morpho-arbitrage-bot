import type { Pool } from "./types.js";

import { getUniswapPools }

    from "./uniswapPools.js";

import { getAerodromePools }

    from "./aerodromePools.js";

export function discoverPools(

    tokenIn: string,

    tokenOut: string

): Pool[] {

    return [

        ...getUniswapPools(

            tokenIn,

            tokenOut

        ),

        ...getAerodromePools(

            tokenIn,

            tokenOut

        )

    ];

}