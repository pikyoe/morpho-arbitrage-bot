import type { SimulatorResult } from "./simulatorResult.js";

import { applySlippage } from "./slippage.js";

import { flashLoanFee } from "../utils/flashFee.js";

export interface RouteInput {

    amountIn: bigint;

    buyQuote: bigint;

    sellQuote: bigint;

    gasCost: bigint;

    swapFee: bigint;

}

export function simulate(

    input: RouteInput

): SimulatorResult {

    const afterBuy =
        applySlippage(

            input.buyQuote,

            30n

        );

    const afterSell =
        applySlippage(

            input.sellQuote,

            30n

        );

    const flash =
        flashLoanFee(

            input.amountIn

        );

    const repayment =
        input.amountIn +

        flash;

    const profit =

        afterSell

        -

        repayment

        -

        input.gasCost

        -

        input.swapFee;

    return {

        amountIn:
            input.amountIn,

        amountAfterBuy:
            afterBuy,

        amountAfterSell:
            afterSell,

        repayment,

        gasCost:
            input.gasCost,

        flashFee:
            flash,

        swapFees:
            input.swapFee,

        profit,

        profitable:
            profit > 0n

    };

}