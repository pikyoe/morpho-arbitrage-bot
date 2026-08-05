import { quote } from "../dex/uniswapQuoter.js";
import { quoteAerodrome } from "../dex/aerodromeQuoter.js";

import type { LiquidityResult } from "./liquidityResult.js";

export async function validateLiquidity(

    tokenIn: string,

    tokenOut: string,

    amount: bigint

): Promise<LiquidityResult> {

    try {

        await quote(
            tokenIn,
            tokenOut,
            amount
        );

        await quoteAerodrome(
            amount,
            tokenIn,
            tokenOut
        );

        return {

            available: true,

            maxAmount: amount

        };

    }

    catch {

        return {

            available: false,

            reason: "Quote failed",

            maxAmount: 0n

        };

    }

}