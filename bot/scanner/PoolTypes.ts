export type DexType =
    | "UNISWAP"
    | "AERODROME"
    | "PANCAKESWAP"
    | "SUSHISWAP"
    | "1INCH";

export interface PoolInfo {

    dex: DexType;

    pool: string;

    token0: string;

    token1: string;

    fee?: number;

    stable?: boolean;

    factory?: string;

    totalValueLockedUSD?: number;

    reserveUSD?: number;

    volumeUSD?: number;

    createdAtTimestamp?: number;

    liquidity?: string; // Pool liquidity for debugging

    sqrtPriceX96?: string; // Current price state

    tick?: number; // Current tick

    /** Raw token reserves for V2-style pools (never interpreted as USD). */
    reserve0Raw?: string;
    reserve1Raw?: string;
    /** How/when liquidity metadata was obtained. */
    liquiditySource?: "subgraph" | "rpc" | "unknown";
    liquidityUpdatedBlock?: number;
}
