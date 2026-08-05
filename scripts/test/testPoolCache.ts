import { PoolCache } from "../scanner/PoolCache.js";

const cache = new PoolCache();

cache.add({

    dex: "UNISWAP",

    pool: "0x111",

    token0: "WETH",

    token1: "USDC",

    fee: 3000

});

cache.add({

    dex: "AERODROME",

    pool: "0x222",

    token0: "WETH",

    token1: "USDC",

    stable: false

});

console.log(cache.size());

console.log(cache.getAll());

console.log(

    cache.findPair(

        "WETH",

        "USDC"

    )

);