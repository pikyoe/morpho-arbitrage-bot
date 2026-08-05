export interface SimulatorResult {

    amountIn: bigint;

    amountAfterBuy: bigint;

    amountAfterSell: bigint;

    repayment: bigint;

    gasCost: bigint;

    flashFee: bigint;

    swapFees: bigint;

    profit: bigint;

    profitable: boolean;

}