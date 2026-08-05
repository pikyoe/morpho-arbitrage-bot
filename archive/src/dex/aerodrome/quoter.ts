import { Contract } from "ethers";

import { provider } from "../../config/provider.js";

import { ADDRESSES } from "../../config/addresses.js";

import { AERODROME_ROUTER_ABI } from "./abi.js";

import { DEFAULT_STABLE } from "./constants.js";

const router =

    new Contract(

        ADDRESSES.AERODROME_ROUTER,

        AERODROME_ROUTER_ABI,

        provider

    );

export async function quote(

    amountIn: bigint,

    tokenIn: string,

    tokenOut: string,

    stable = DEFAULT_STABLE

) {

    const route = [{

        from: tokenIn,

        to: tokenOut,

        stable,

        factory: "0x0000000000000000000000000000000000000000"

    }];

    const amounts =

        await router.getAmountsOut(

            amountIn,

            route

        );

    return amounts[1];

}