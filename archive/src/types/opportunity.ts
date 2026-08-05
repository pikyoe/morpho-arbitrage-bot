export interface Opportunity {

    dexBuy: string;

    dexSell: string;

    tokenIn: string;

    tokenOut: string;

    amountIn: bigint;

    buyAmount: bigint;

    sellAmount: bigint;

    grossProfit: bigint;

    estimatedGas: bigint;

    flashLoanFee: bigint;

    swapFee: bigint;

    netProfit: bigint;

}