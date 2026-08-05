export type DexType =
    | "UNISWAP"
    | "AERODROME";

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

}
