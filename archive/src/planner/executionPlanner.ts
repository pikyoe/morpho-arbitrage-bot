import type {

    ExecutionPlan,

    SwapStep

} from "./plannerTypes.js";

export function buildPlan(

    flashToken: string,

    flashAmount: bigint,

    swaps: SwapStep[],

    expectedProfit: bigint

): ExecutionPlan {

    return {

        flashToken,

        flashAmount,

        swaps,

        expectedProfit

    };

}