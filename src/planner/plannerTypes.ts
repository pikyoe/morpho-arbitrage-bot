export interface SwapStep {

    dex: string;

    adapter: string;

    tokenIn: string;

    tokenOut: string;

    fee: number;

    amountIn: bigint;

    minAmountOut: bigint;

    deadline?: bigint | number;

}

export interface ExecutionPlan {

    flashToken: string;

    flashAmount: bigint;

    swaps: SwapStep[];

    expectedProfit: bigint;

}