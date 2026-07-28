export interface SwapStep {

    adapter: string;

    tokenIn: string;

    tokenOut: string;

    amountIn: bigint;

    minAmountOut: bigint;

    data: string;

}

export interface Route {

    swaps: SwapStep[];

    profitToken: string;

    minProfit: bigint;

}