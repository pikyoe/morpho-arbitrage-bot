import { Contract } from "ethers";

import { provider } from "../config/provider.js";

import { UNISWAP_POOL_ABI } from "./abi.js";

import type { PoolState } from "./types.js";

export async function readPoolState(

    address: string

): Promise<PoolState> {

    const pool =

        new Contract(

            address,

            UNISWAP_POOL_ABI,

            provider

        );

    const [

        token0,

        token1,

        fee,

        liquidity,

        slot0

    ] =

    await Promise.all([

        pool.token0(),

        pool.token1(),

        pool.fee(),

        pool.liquidity(),

        pool.slot0()

    ]);

    return {

        address,

        token0,

        token1,

        fee,

        liquidity,

        sqrtPriceX96: slot0.sqrtPriceX96,

        tick: slot0.tick

    };

}