export interface SwapStep {

    adapter: string;

    tokenIn: string;

    tokenOut: string;

    fee: number;

    amountIn: bigint;

    minAmountOut: bigint;

    data: string;

    deadline?: bigint | number;

}

export interface Route {

    swaps: SwapStep[];

    profitToken: string;

    minProfit: bigint;

}