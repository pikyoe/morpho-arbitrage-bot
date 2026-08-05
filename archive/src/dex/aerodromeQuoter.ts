import { Contract } from "ethers";

import { provider } from "../config/provider.js";
import { ADDRESSES } from "../config/addresses.js";
import { AERODROME_ROUTER_ABI } from "../abi/aerodromeRouter.js";

export const aerodromeRouter =
    new Contract(
        ADDRESSES.AERODROME_ROUTER,
        AERODROME_ROUTER_ABI,
        provider
    );

export async function quoteAerodrome(
    amountIn: bigint,
    tokenIn: string,
    tokenOut: string,
    stable = false
) {
    const route = [{
        from: tokenIn,
        to: tokenOut,
        stable,
        factory: "0x0000000000000000000000000000000000000000"
    }];

    const amounts =
        await aerodromeRouter.getAmountsOut(
            amountIn,
            route
        );

    return amounts[1];
}