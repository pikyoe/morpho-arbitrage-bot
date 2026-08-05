import { getUniswapPools } from "./uniswapPools.js";
import { getAerodromePools } from "./aerodromePools.js";
export function discoverPools(tokenIn, tokenOut) {
    return [
        ...getUniswapPools(tokenIn, tokenOut),
        ...getAerodromePools(tokenIn, tokenOut)
    ];
}
