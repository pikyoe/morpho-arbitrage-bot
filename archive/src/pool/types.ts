export interface PoolState {

    address: string;

    token0: string;

    token1: string;

    fee: number;

    liquidity: bigint;

    sqrtPriceX96: bigint;

    tick: number;

}